import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { evaluatePersistedCable, createCable } from './masterDataRepository';
import {
  updateEngineeringMappingDraft,
  processMappingWorkflowAction,
  getEngineeringMappingDetail,
} from './governanceRepository';
import { DomainError } from '../platform/errors/domainError';
import { assertCanApproveEngineeringMapping, assertCanEditEngineeringMapping } from './rbac';

dotenv.config();

describe('Increment 6 — Engineering Mapping & Technical Office Approval Workflow', () => {
  const testMat = 'I6-TEST-CABLE-01';
  const actorTO = { id: 'u-to-1', name: 'Eng. Ahmed (Technical Office)', userType: 'internal', permissions: { technicalOffice: true, masterData: true } };
  const actorManager = { id: 'u-to-mgr', name: 'Eng. Khaled Elsewedy', userType: 'internal', permissions: { technicalOffice: true, masterData: true } };
  const actorCustomer = { id: 'u-cust-1', name: 'David Smith', userType: 'customer', permissions: { masterData: false, technicalOffice: false } };

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);

    // Ensure clean state for test cable
    await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: testMat } });
    await prisma.cableMaster.deleteMany({ where: { materialNumber: testMat } });

    // Create test cable with source diameter/weight, no approved engineering fields
    await createCable(
      {
        id: `mc-${testMat}`,
        itemCode: 'I6-ITEM-01',
        cableCode: testMat,
        customerCode: 'N2XH',
        code: `N2XH ${testMat}`,
        description: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 RMC IEC 60502-1',
        voltageClass: 'LV',
        conductor: 'Copper',
        cores: '1C',
        crossSectionMm2: 16,
        outerDiameterMm: 10.9,
        approxWeightKgKm: 268,
        standardPriceUsdPerM: 0,
        priceConfigured: false,
        status: 'ACTIVE',
      },
      actorTO
    );

    // Create initial DRAFT mapping
    await prisma.cableEngineeringMapping.create({
      data: {
        materialNumber: testMat,
        revision: 1,
        isCurrent: true,
        status: 'DRAFT',
        mappingStatus: 'PARTIAL',
        dataSource: 'Energya Cable Master Data.xlsx / Cable List',
        attributes: [
          { field: 'diameter', value: 10.9, origin: 'SOURCE' },
          { field: 'weight', value: 268, origin: 'SOURCE' },
          { field: 'family', value: null, origin: 'MISSING' },
          { field: 'voltage', value: null, origin: 'MISSING' },
          { field: 'conductor', value: null, origin: 'MISSING' },
          { field: 'conductorSize', value: null, origin: 'MISSING' },
          { field: 'cores', value: null, origin: 'MISSING' },
          { field: 'insulation', value: null, origin: 'MISSING' },
        ],
        suggested: {
          conductor: { value: 'Copper', label: 'Suggested' },
          insulation: { value: 'XLPE', label: 'Suggested' },
          voltage: { value: '0.6/1 kV', label: 'Suggested' },
        },
      },
    });
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: testMat } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber: testMat } });
    }
    await disconnectPrisma();
  });

  // Test 1: Cable with no approved mapping -> CONFIGURATION_REQUIRED
  it('Test 1: Cable with no approved mapping (DRAFT) evaluates to CONFIGURATION_REQUIRED for structured search', async () => {
    const decision = await evaluatePersistedCable({
      materialNumber: testMat,
      family: 'LV',
      voltage: '600/1000V',
      conductor: 'Copper',
      conductorSize: 16,
      cores: 1,
      insulation: 'XLPE',
    });
    assert.equal(decision.code, 'CONFIGURATION_REQUIRED');
  });

  // Test 3: Draft mapping -> CONFIGURATION_REQUIRED
  it('Test 3: Draft mapping remains CONFIGURATION_REQUIRED and does not produce false EXISTING_CABLE', async () => {
    await updateEngineeringMappingDraft(
      testMat,
      {
        family: 'LV',
        voltage: '600/1000V',
        conductor: 'Copper',
        conductorSize: '16',
        cores: '1',
        insulation: 'XLPE',
      },
      actorTO
    );

    const detail = await getEngineeringMappingDetail(testMat);
    assert.equal(detail?.current.workflowStatus, 'DRAFT');

    const decision = await evaluatePersistedCable({
      materialNumber: testMat,
      family: 'LV',
      voltage: '600/1000V',
      conductor: 'Copper',
      conductorSize: 16,
      cores: 1,
      insulation: 'XLPE',
    });
    assert.equal(decision.code, 'CONFIGURATION_REQUIRED');
  });

  // Test 5: Approved mapping with invalid compatibility -> approval blocked
  it('Test 5: Approving mapping with invalid parameter compatibility is blocked with error', async () => {
    // Put incompatible family/voltage: HV with 600/1000V
    const prisma = getPrisma();
    await prisma!.cableEngineeringMapping.updateMany({
      where: { materialNumber: testMat, isCurrent: true },
      data: {
        family: 'HV',
        voltage: '600/1000V',
        status: 'SUBMITTED',
      },
    });

    await assert.rejects(
      () => processMappingWorkflowAction(testMat, 'APPROVE', {}, actorManager),
      (err: any) => err.code === 'APPROVAL_BLOCKED_INVALID_COMPATIBILITY'
    );
  });

  // Test 4: Rejected mapping -> CONFIGURATION_REQUIRED
  it('Test 4: Rejected mapping evaluates to CONFIGURATION_REQUIRED', async () => {
    // Current status is SUBMITTED from Test 5, so REJECT is valid
    await processMappingWorkflowAction(testMat, 'REJECT', { comments: 'Incompatible high voltage family' }, actorManager);
    const detail = await getEngineeringMappingDetail(testMat);
    assert.equal(detail?.current.workflowStatus, 'REJECTED');

    const decision = await evaluatePersistedCable({
      materialNumber: testMat,
      family: 'LV',
      voltage: '600/1000V',
      conductor: 'Copper',
      conductorSize: 16,
      cores: 1,
      insulation: 'XLPE',
    });
    assert.equal(decision.code, 'CONFIGURATION_REQUIRED');
  });

  // Test 6: Customer attempts mapping change -> 403 UNAUTHORIZED
  it('Test 6: Customer role cannot edit or approve engineering mapping (403 UNAUTHORIZED)', () => {
    assert.throws(
      () => assertCanEditEngineeringMapping(actorCustomer),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
    assert.throws(
      () => assertCanApproveEngineeringMapping(actorCustomer),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  // Test 7 & Test 2: Technical Office approval -> approved mapping becomes authoritative EXISTING_CABLE
  it('Test 7 & Test 2: Technical Office valid approval makes the mapping authoritative (EXISTING_CABLE)', async () => {
    // Return to draft and put valid engineering data
    await processMappingWorkflowAction(testMat, 'CANCEL', {}, actorTO).catch(() => {});
    const prisma = getPrisma();
    await prisma!.cableEngineeringMapping.updateMany({
      where: { materialNumber: testMat },
      data: { status: 'DRAFT' },
    });

    await updateEngineeringMappingDraft(
      testMat,
      {
        family: 'LV',
        voltage: '600/1000V',
        conductor: 'Copper',
        conductorSize: '16',
        cores: '1',
        insulation: 'XLPE',
        standard: 'IEC 60502-1',
      },
      actorTO
    );

    await processMappingWorkflowAction(testMat, 'SUBMIT', { comments: 'Ready for manager sign-off' }, actorTO);
    await processMappingWorkflowAction(testMat, 'APPROVE', { comments: 'Approved by TO Manager' }, actorManager);

    const detail = await getEngineeringMappingDetail(testMat);
    assert.equal(detail?.current.workflowStatus, 'APPROVED');
    assert.equal(detail?.current.approvedBy, actorManager.name);

    // Test 2: Now Cable Authority matches the approved mapping
    const decision = await evaluatePersistedCable({
      materialNumber: testMat,
      family: 'LV',
      voltage: '600/1000V',
      conductor: 'Copper',
      conductorSize: 16,
      cores: 1,
      insulation: 'XLPE',
    });
    assert.equal(decision.code, 'EXISTING_CABLE');
    assert.equal(decision.cable?.materialNumber, testMat);
  });

  // Test 8: Approved mapping revision -> previous revision remains immutable
  it('Test 8: Editing an approved mapping creates an immutable revision history', async () => {
    // Edit the approved mapping
    const revised = await updateEngineeringMappingDraft(
      testMat,
      {
        family: 'LV',
        voltage: '600/1000V',
        conductor: 'Copper',
        conductorSize: '16',
        cores: '1',
        insulation: 'XLPE',
        armour: 'SWA', // added armour in new revision
      },
      actorTO
    );

    assert.equal(revised.revision, 2);
    assert.equal(revised.workflowStatus, 'DRAFT');

    const detail = await getEngineeringMappingDetail(testMat);
    assert.equal(detail?.history.length, 2);

    const v1 = detail?.history.find((h: any) => h.revision === 1);
    const v2 = detail?.history.find((h: any) => h.revision === 2);

    assert.equal(v1?.workflowStatus, 'APPROVED');
    assert.equal(v1?.isCurrent, false);
    assert.equal(v2?.workflowStatus, 'DRAFT');
    assert.equal(v2?.isCurrent, true);
  });
});
