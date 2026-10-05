import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { containerStudyRouter } from '../server/containerStudyRoutes';
import { workflowRouter } from '../server/workflowRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { STANDARD_INQUIRY_TEMPLATE_CODE } from '../domain/workflowRuntimeService';
import { assertCanTransitionWorkflow } from '../server/rbac';
import { evaluateContainerStudyGate } from '../domain/containerStudyReadiness';
import { containerStudyRequiredForCosting } from '../domain/costingContainerStudyPin';
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
import {
  auditCostingContainerStudyPin,
  resolveCostingContainerStudyPin,
} from '../server/costingContainerStudyPinService';

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

describe('Task 05I-DF-E — Standard Workflow Container Study integration', () => {
  it('1. Standard without shipment can proceed without CS', () => {
    const gate = evaluateStandardContainerStudyWorkflowGate(evidence({}));
    assert.equal(gate.required, false);
    assert.equal(gate.ready, true);
    assert.equal(gate.code, CONTAINER_STUDY_NOT_REQUIRED);
    const readiness = evaluateStandardPostSubmitReadiness({
      lines: [validLine],
      containerStudyEvidence: evidence({}),
    });
    assert.equal(readiness.blockingReasons.some((m) => /container study/i.test(m)), false);
    assert.equal(readiness.containerStudy.status, 'PASS');
  });

  it('2. Standard requiring shipment blocked without Shipment Group', () => {
    const gate = evaluateStandardContainerStudyWorkflowGate(
      evidence({
        studies: [
          {
            id: 'st1',
            shipmentGroupId: null,
            status: 'DRAFT',
            currentSnapshotId: 'snap',
            currentResultId: 'res',
            resultInputSnapshotId: 'snap',
          },
        ],
      })
    );
    assert.equal(gate.required, true);
    assert.equal(gate.status, 'BLOCK');
    assert.equal(gate.code, SHIPMENT_GROUP_REQUIRED);
  });

  it('3. Blocked without confirmed Drum Plan', () => {
    const gate = evaluateStandardContainerStudyWorkflowGate(
      evidence({
        shipmentGroups: [{ id: 'g1' }],
        studies: [
          {
            id: 'st1',
            shipmentGroupId: 'g1',
            status: 'DRAFT',
            currentSnapshotId: 'snap',
            currentResultId: 'res',
            resultInputSnapshotId: 'snap',
          },
        ],
        drumPlansConfirmed: false,
      })
    );
    assert.equal(gate.status, 'BLOCK');
    assert.equal(gate.code, 'DRUM_PLAN_NOT_CONFIRMED');
  });

  it('4. Blocked without snapshot', () => {
    const gate = evaluateStandardContainerStudyWorkflowGate(
      evidence({
        shipmentGroups: [{ id: 'g1' }],
        studies: [
          {
            id: 'st1',
            shipmentGroupId: 'g1',
            status: 'DRAFT',
            currentSnapshotId: null,
            currentResultId: null,
            resultInputSnapshotId: null,
          },
        ],
      })
    );
    assert.equal(gate.status, 'BLOCK');
    assert.equal(gate.code, CONTAINER_STUDY_SNAPSHOT_NOT_READY);
  });

  it('5. Blocked without ContainerStudyResult', () => {
    const gate = evaluateStandardContainerStudyWorkflowGate(
      evidence({
        shipmentGroups: [{ id: 'g1' }],
        studies: [
          {
            id: 'st1',
            shipmentGroupId: 'g1',
            status: 'DRAFT',
            currentSnapshotId: 'snap',
            currentResultId: null,
            resultInputSnapshotId: null,
          },
        ],
      })
    );
    assert.equal(gate.status, 'BLOCK');
    assert.equal(gate.code, CONTAINER_STUDY_CALCULATION_INCOMPLETE);
  });

  it('6. Result enables CS readiness gate', () => {
    const gate = evaluateStandardContainerStudyWorkflowGate(
      evidence({
        shipmentGroups: [{ id: 'g1' }],
        studies: [
          {
            id: 'st1',
            shipmentGroupId: 'g1',
            status: 'VALIDATED',
            currentSnapshotId: 'snap',
            currentResultId: 'res1',
            resultInputSnapshotId: 'snap',
          },
        ],
      })
    );
    assert.equal(gate.status, 'PASS');
    assert.equal(gate.ready, true);
    assert.equal(gate.code, CONTAINER_STUDY_RESULT_READY);
    assert.equal(gate.requiredResultId, 'res1');
  });

  it('7. CostingRun must pin required result', () => {
    const missing = evaluateStandardCostingPinForCurrentWorkflow({
      required: true,
      requiredResultId: 'res1',
      currentLineCostingRuns: [{ id: 'cr1', inquiryLineId: 'l1', containerStudyResultId: null }],
    });
    assert.equal(missing?.status, 'BLOCK');
    assert.equal(missing?.code, COSTING_CONTAINER_STUDY_PIN_REQUIRED);
    const ok = evaluateStandardCostingPinForCurrentWorkflow({
      required: true,
      requiredResultId: 'res1',
      currentLineCostingRuns: [{ id: 'cr1', inquiryLineId: 'l1', containerStudyResultId: 'res1' }],
    });
    assert.equal(ok?.status, 'PASS');
  });

  it('8. New result does not silently repoint existing CostingRun', () => {
    assert.equal(costingRunPinMustRemain('r1', 'r2'), 'r1');
    const stale = evaluateStandardCostingPinForCurrentWorkflow({
      required: true,
      requiredResultId: 'r2',
      currentLineCostingRuns: [{ id: 'cr1', inquiryLineId: 'l1', containerStudyResultId: 'r1' }],
    });
    assert.equal(stale?.status, 'BLOCK');
    assert.equal(stale?.code, COSTING_CONTAINER_STUDY_PIN_STALE);
  });

  it('9. Historical CostingRun valid after CS recalc', () => {
    assert.equal(historicalStandardCostingPinRemainsValid('r1', 'r2'), true);
    assert.equal(costingRunPinMustRemain('r1', 'r2'), 'r1');
  });

  it('10. Fail closed when required dependency missing/mismatched', () => {
    const missingStudy = evaluateStandardContainerStudyWorkflowGate(
      evidence({ shipmentGroups: [{ id: 'g1' }], studies: [] })
    );
    assert.equal(missingStudy.code, CONTAINER_STUDY_MISSING);
    const mismatch = evaluateStandardContainerStudyWorkflowGate(
      evidence({
        shipmentGroups: [{ id: 'g1' }],
        studies: [
          {
            id: 'st1',
            shipmentGroupId: 'g-other',
            status: 'DRAFT',
            currentSnapshotId: 'snap',
            currentResultId: 'res',
            resultInputSnapshotId: 'snap',
          },
        ],
      })
    );
    assert.equal(mismatch.code, CONTAINER_STUDY_DEPENDENCY_MISMATCH);
    const snapMismatch = evaluateStandardContainerStudyWorkflowGate(
      evidence({
        shipmentGroups: [{ id: 'g1' }],
        studies: [
          {
            id: 'st1',
            shipmentGroupId: 'g1',
            status: 'DRAFT',
            currentSnapshotId: 'snap-new',
            currentResultId: 'res',
            resultInputSnapshotId: 'snap-old',
          },
        ],
      })
    );
    assert.equal(snapMismatch.status, 'BLOCK');
    assert.match(String(snapMismatch.code), /MISMATCH|SNAPSHOT/);
  });

  it('11. VIP_FAST_TRACK: CS required when shipment/logistics active; optional when not', () => {
    assert.equal(
      deriveStandardShipmentCalculationRequired({
        processCode: 'VIP_FAST_TRACK',
        shipmentGroupCount: 2,
        containerStudyCount: 1,
      }),
      true
    );
    assert.equal(
      deriveStandardShipmentCalculationRequired({
        processCode: 'VIP_FAST_TRACK',
        shipmentGroupCount: 0,
        containerStudyCount: 0,
      }),
      false
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
    const vipGate = evaluateContainerStudyGate({
      metadata: { containerStudyReadiness: 'CONTAINER_STUDY_REQUIRED' },
      devBypass: false,
    });
    assert.equal(vipGate.blocked, false);
    assert.equal(vipGate.ready, false);
    assert.equal(vipGate.reasonCode, 'CONTAINER_DATA_NOT_CONFIGURED');
    const ready = evaluateContainerStudyGate({
      metadata: { containerStudyReadiness: 'CONTAINER_STUDY_READY' },
      devBypass: false,
    });
    assert.equal(ready.ready, true);
    assert.equal(ready.blocked, false);
  });

  it('metadata CONTAINER_STUDY_READY is not a Standard substitute for persisted CS state', () => {
    const readiness = evaluateStandardPostSubmitReadiness({
      lines: [validLine],
      containerStudyEvidence: evidence({
        shipmentGroups: [{ id: 'g1' }],
        studies: [
          {
            id: 'st1',
            shipmentGroupId: 'g1',
            status: 'DRAFT',
            currentSnapshotId: null,
            currentResultId: null,
            resultInputSnapshotId: null,
          },
        ],
      }),
    });
    assert.equal(readiness.containerStudy.status, 'BLOCK');
    assert.notEqual(readiness.containerStudy.code, 'CONTAINER_STUDY_READY');
  });
});

describe('Task 05I-DF-E — persisted Standard gate + customer isolation', () => {
  let base = '';
  let server: http.Server;
  let tokenInternal = '';
  let tokenA = '';
  let actorInternal: { id: string; email: string; name: string; userType: 'internal' };
  const suffix = `dfe-${Date.now()}`;
  const drumCode = `EWD-DFE-${suffix}`;
  const materialNumber = `TEST-MAT-DFE-${suffix}`;
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
        itemCode: 'TEST-ITEM-DFE',
        customerCode: 'TEST-CUST-DFE',
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

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    await prisma.cableMaster.upsert({
      where: { materialNumber },
      create: {
        materialNumber,
        itemCode: `ITEM-DFE-${suffix}`,
        customerCode: 'TEST-CUST-DFE',
        description: 'DFE workflow cable',
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
    const custA = await prisma.customer.create({ data: { code: `DFE-A-${suffix}`, name: 'DFE A' } });
    const internal = await prisma.userAccount.create({
      data: {
        username: `dfe-int-${suffix}`,
        email: `dfe-int-${suffix}@test.local`,
        fullName: 'DFE Internal',
        userType: 'internal',
        passwordHash: await hashPassword('DfeTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const userA = await prisma.userAccount.create({
      data: {
        username: `dfe-a-${suffix}`,
        email: `dfe-a-${suffix}@test.local`,
        fullName: 'DFE A',
        userType: 'customer',
        passwordHash: await hashPassword('DfeTest@2026!'),
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
    const started = await listen(app);
    server = started.server;
    base = started.base;
    const loginInt = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: internal.email, password: 'DfeTest@2026!' }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'DfeTest@2026!' }),
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
      await deleteV2LineageForInquiries(prisma, inquiryIds);
      await prisma.commercialInquiryLine.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
      await prisma.commercialInquiry.deleteMany({ where: { id: { in: inquiryIds } } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('persisted shipment group without snapshot blocks Standard orchestrator (not metadata)', async () => {
    const created = await createInquiryWithLine(`DFE block ${suffix}`);
    await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const groupRes = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-DFE-BLK-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ROTTERDAM',
        incotermCode: 'CIF',
      }),
    });
    assert.equal(groupRes.status, 201, groupRes.body.error || JSON.stringify(groupRes.body));
    const studyRes = await json(base, `/api/v2/inquiries/${created.inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: groupRes.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
    assert.equal(studyRes.status, 201, studyRes.body.error || JSON.stringify(studyRes.body));
    const result = await runStandardWorkflowAfterSubmit(created.inquiryId, actorInternal);
    assert.equal(result.status, 'CONTAINER_STUDY_BLOCKED');
    assert.ok(result.gates.some((g) => g.code === CONTAINER_STUDY_SNAPSHOT_NOT_READY));
  });

  it('7–9 persisted: pin required, no silent repoint, historical pin remains', async () => {
    const prisma = getPrisma()!;
    const created = await createInquiryWithLine(`DFE pin ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const groupRes = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-DFE-PIN-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ROTTERDAM',
        incotermCode: 'CIF',
      }),
    });
    assert.equal(groupRes.status, 201, JSON.stringify(groupRes.body));
    const studyRes = await json(base, `/api/v2/inquiries/${created.inquiryId}/container-studies`, {
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
        inquiryLineId: created.lineId,
        drumPlanId: drum.planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 201, JSON.stringify(snap.body));
    const missing = await resolveCostingContainerStudyPin({
      inquiryId: created.inquiryId,
      inquiryLineId: created.lineId,
    });
    assert.equal(missing.ok, false);
    const calc = await json(base, `/api/v2/inquiries/${created.inquiryId}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(calc.status, 200, JSON.stringify(calc.body));
    const r1 = calc.body.study.currentResultId as string;
    const pin = await resolveCostingContainerStudyPin({
      inquiryId: created.inquiryId,
      inquiryLineId: created.lineId,
      requestedResultId: r1,
    });
    assert.equal(pin.ok, true);
    if (!pin.ok) throw new Error('pin failed');
    const run = await prisma.costingRun.create({
      data: {
        costingRunNumber: `CR-DFE-${suffix}`,
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
    const stored = await prisma.costingRun.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(stored.containerStudyResultId, r1);
    assert.notEqual(stored.containerStudyResultId, r2);
    assert.equal(costingRunPinMustRemain(stored.containerStudyResultId, r2), r1);
    assert.equal(historicalStandardCostingPinRemainsValid(stored.containerStudyResultId!, r2), true);
    const currentGate = evaluateStandardCostingPinForCurrentWorkflow({
      required: true,
      requiredResultId: r2,
      currentLineCostingRuns: [
        { id: stored.id, inquiryLineId: created.lineId, containerStudyResultId: stored.containerStudyResultId },
      ],
    });
    assert.equal(currentGate?.code, COSTING_CONTAINER_STUDY_PIN_STALE);
  });

  it('12. Customer cannot mutate Standard workflow readiness', async () => {
    assert.throws(
      () =>
        assertCanTransitionWorkflow({
          id: 'cust',
          email: 'c@test.local',
          name: 'Cust',
          userType: 'customer',
        }),
      /cannot perform internal workflow transitions/i
    );
    const started = await json(base, '/api/v2/workflows/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateCode: STANDARD_INQUIRY_TEMPLATE_CODE,
        entityType: 'CommercialInquiry',
        entityId: `dfe-wf-${suffix}`,
        contextJson: { inquiryProcessCode: 'STANDARD_WORKFLOW' },
      }),
    });
    assert.equal(started.status, 201, JSON.stringify(started.body));
    const denied = await json(base, `/api/v2/workflows/instances/${started.body.id}/transition`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transitionCode: 'TO_COSTING' }),
    });
    assert.ok(denied.status === 403 || denied.status === 401, JSON.stringify(denied.body));
    assert.notEqual(denied.status, 200);
  });
});
