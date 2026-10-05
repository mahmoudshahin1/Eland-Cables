import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { evaluatePersistedCable, createCable } from './masterDataRepository';
import {
  updateEngineeringMappingDraft,
  processMappingWorkflowAction,
  getEngineeringMappingDetail,
  validateBulkEngineeringMappings,
  processBulkWorkflowAction,
  importEngineeringMappingsFromRows,
} from './governanceRepository';
import { DomainError } from '../platform/errors/domainError';
import { assertCanApproveEngineeringMapping, assertCanEditEngineeringMapping } from './rbac';

dotenv.config();

describe('Increment 7 — Technical Office Engineering Workbench & Batch Approval', () => {
  const testMat1 = 'I7-WORKBENCH-CABLE-01';
  const testMat2 = 'I7-WORKBENCH-CABLE-02';
  const actorTO = { id: 'u-to-1', name: 'Eng. Ahmed (Technical Office)', userType: 'internal', permissions: { technicalOffice: true, masterData: true } };
  const actorManager = { id: 'u-to-mgr', name: 'Eng. Khaled Elsewedy (TO Manager)', userType: 'internal', permissions: { technicalOffice: true, masterData: true } };
  const actorCustomer = { id: 'u-cust-1', name: 'David Smith', userType: 'customer', permissions: { masterData: false, technicalOffice: false } };

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);

    // Clean up test data & audit events
    await prisma.auditEvent.deleteMany({
      where: {
        entity: 'CableEngineeringMapping',
        entityId: { in: [`${testMat1}-V1`, `${testMat1}-V2`, `${testMat2}-V1`, `${testMat2}-V2`] },
      },
    });
    await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: { in: [testMat1, testMat2] } } });
    await prisma.cableMaster.deleteMany({ where: { materialNumber: { in: [testMat1, testMat2] } } });

    // Seed test cable 1 and 2
    for (const mat of [testMat1, testMat2]) {
      await createCable(
        {
          id: `mc-${mat}`,
          itemCode: `ITEM-${mat}`,
          cableCode: mat,
          customerCode: 'N2XH',
          code: `N2XH ${mat}`,
          description: `Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 ${mat}`,
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

      await prisma.cableEngineeringMapping.create({
        data: {
          materialNumber: mat,
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
        },
      });
    }
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.auditEvent.deleteMany({
        where: {
          entity: 'CableEngineeringMapping',
          entityId: { in: [`${testMat1}-V1`, `${testMat1}-V2`, `${testMat2}-V1`, `${testMat2}-V2`] },
        },
      });
      await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: { in: [testMat1, testMat2] } } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber: { in: [testMat1, testMat2] } } });
    }
    await disconnectPrisma();
  });

  // Test 1: Excel mapping import
  it('Test 1: Excel mapping import parses and updates draft engineering mapping without changing CableMaster source values', async () => {
    const prisma = getPrisma();
    const beforeCable = await prisma!.cableMaster.findUnique({ where: { materialNumber: testMat1 } });
    assert.ok(beforeCable);

    const importRows = [
      {
        'Material Number': testMat1,
        'Cable Family': 'LV',
        'Voltage': '600/1000V',
        'Conductor Material': 'Copper',
        'Conductor Size': '16',
        'Number of Cores': '1',
        'Insulation': 'XLPE',
        'Standard': 'IEC 60502-1',
        'Comment': 'Imported via Excel template',
      },
    ];

    const result = await importEngineeringMappingsFromRows(importRows, 'Test_Import.xlsx', actorTO);
    assert.equal(result.importedCount, 1);

    const detail = await getEngineeringMappingDetail(testMat1);
    assert.equal(detail?.current.workflowStatus, 'DRAFT');
    assert.equal(detail?.current.family, 'LV');
    assert.equal(detail?.current.voltage, '600/1000V');

    // Test 13: Source data protection
    const afterCable = await prisma!.cableMaster.findUnique({ where: { materialNumber: testMat1 } });
    assert.equal(Number(afterCable?.diameter), Number(beforeCable?.diameter));
    assert.equal(Number(afterCable?.weight), Number(beforeCable?.weight));
    assert.equal(afterCable?.description, beforeCable?.description);
  });

  // Test 2: Unknown Material Number
  it('Test 2: Excel import with unknown Material Number fails validation and is rejected', async () => {
    const importRows = [
      {
        'Material Number': 'UNKNOWN-MATERIAL-999',
        'Cable Family': 'LV',
        'Voltage': '600/1000V',
        'Conductor Material': 'Copper',
      },
    ];

    await assert.rejects(
      () => importEngineeringMappingsFromRows(importRows, 'Bad_Import.xlsx', actorTO),
      (err: any) => err.code === 'IMPORT_VALIDATION_FAILED' && err.preview.unknownCableCount === 1
    );
  });

  // Test 3: Duplicate Material Number
  it('Test 3: Excel import with duplicate Material Number rows is rejected', async () => {
    const importRows = [
      {
        'Material Number': testMat1,
        'Cable Family': 'LV',
        'Voltage': '600/1000V',
        'Conductor Material': 'Copper',
      },
      {
        'Material Number': testMat1,
        'Cable Family': 'LV',
        'Voltage': '600/1000V',
        'Conductor Material': 'Aluminum',
      },
    ];

    await assert.rejects(
      () => importEngineeringMappingsFromRows(importRows, 'Dup_Import.xlsx', actorTO),
      (err: any) => err.code === 'IMPORT_VALIDATION_FAILED' && err.preview.duplicateCount === 1
    );
  });

  // Test 4: Invalid Parameter
  it('Test 4: Excel import with invalid parameter value is rejected', async () => {
    const importRows = [
      {
        'Material Number': testMat1,
        'Cable Family': 'NOT-AN-EXISTING-FAMILY',
        'Voltage': '600/1000V',
        'Conductor Material': 'Copper',
      },
    ];

    await assert.rejects(
      () => importEngineeringMappingsFromRows(importRows, 'Invalid_Param.xlsx', actorTO),
      (err: any) => err.code === 'IMPORT_VALIDATION_FAILED'
    );
  });

  // Test 5: Incompatible Family / Voltage
  it('Test 5: Excel import with incompatible Family/Voltage combination is rejected', async () => {
    const importRows = [
      {
        'Material Number': testMat1,
        'Cable Family': 'HV',
        'Voltage': '600/1000V', // Incompatible
        'Conductor Material': 'Copper',
      },
    ];

    await assert.rejects(
      () => importEngineeringMappingsFromRows(importRows, 'Incompat.xlsx', actorTO),
      (err: any) => err.code === 'IMPORT_VALIDATION_FAILED'
    );
  });

  // Test 6 & 7: Valid mapping & Bulk Submission
  it('Test 6 & 7: Valid mappings in Draft status can be bulk validated and submitted', async () => {
    // Ensure both testMat1 and testMat2 have valid attributes in draft
    for (const mat of [testMat1, testMat2]) {
      await updateEngineeringMappingDraft(
        mat,
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
    }

    const val = await validateBulkEngineeringMappings([testMat1, testMat2]);
    assert.equal(val.validCount, 2);
    assert.equal(val.invalidCount, 0);
    assert.equal(val.canApproveAllSelected, true);

    const submitRes = await processBulkWorkflowAction(
      [testMat1, testMat2],
      'SUBMIT',
      { comments: 'Ready for batch review' },
      actorTO
    );
    assert.equal(submitRes.processedCount, 2);

    const d1 = await getEngineeringMappingDetail(testMat1);
    const d2 = await getEngineeringMappingDetail(testMat2);
    assert.equal(d1?.current.workflowStatus, 'SUBMITTED');
    assert.equal(d2?.current.workflowStatus, 'SUBMITTED');
  });

  // Test 8: Unauthorized bulk approval
  it('Test 8: Customer attempting bulk approval is blocked with 403 UNAUTHORIZED', () => {
    assert.throws(
      () => assertCanApproveEngineeringMapping(actorCustomer),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  // Test 9 & 10: Authorized batch approval & Audit events
  it('Test 9 & 10: Authorized Technical Office Manager batch approval succeeds and creates one audit event per record', async () => {
    const prisma = getPrisma();
    const approveRes = await processBulkWorkflowAction(
      [testMat1, testMat2],
      'APPROVE',
      { comments: 'Batch approved by TO Manager' },
      actorManager
    );
    assert.equal(approveRes.processedCount, 2);

    const d1 = await getEngineeringMappingDetail(testMat1);
    const d2 = await getEngineeringMappingDetail(testMat2);
    assert.equal(d1?.current.workflowStatus, 'APPROVED');
    assert.equal(d2?.current.workflowStatus, 'APPROVED');
    assert.equal(d1?.current.approvedBy, actorManager.name);
    assert.equal(d2?.current.approvedBy, actorManager.name);

    // Verify audit events exist
    const audits = await prisma!.auditEvent.findMany({
      where: {
        entity: 'CableEngineeringMapping',
        entityId: { in: [`${testMat1}-V1`, `${testMat2}-V1`] },
        action: 'APPROVE',
      },
    });
    assert.equal(audits.length, 2);
  });

  // Test 11 & 12: Revision creation & Immutable previous revision
  it('Test 11 & 12: Updating an approved mapping creates Revision V2 while V1 remains immutable and approved', async () => {
    const revised = await updateEngineeringMappingDraft(
      testMat1,
      {
        family: 'LV',
        voltage: '600/1000V',
        conductor: 'Copper',
        conductorSize: '16',
        cores: '1',
        insulation: 'XLPE',
        armour: 'NONE',
      },
      actorTO
    );
    assert.equal(revised.revision, 2);
    assert.equal(revised.workflowStatus, 'DRAFT');

    const detail = await getEngineeringMappingDetail(testMat1);
    assert.equal(detail?.history.length, 2);

    const v1 = detail?.history.find((h: any) => h.revision === 1);
    const v2 = detail?.history.find((h: any) => h.revision === 2);
    assert.equal(v1?.workflowStatus, 'APPROVED');
    assert.equal(v1?.isCurrent, false);
    assert.equal(v2?.workflowStatus, 'DRAFT');
    assert.equal(v2?.isCurrent, true);
  });

  // Test 14: Cable Authority integration
  it('Test 14: Cable Authority evaluates APPROVED mapping (testMat2) as EXISTING_CABLE', async () => {
    const decision = await evaluatePersistedCable({
      materialNumber: testMat2,
      family: 'LV',
      voltage: '600/1000V',
      conductor: 'Copper',
      conductorSize: 16,
      cores: 1,
      insulation: 'XLPE',
    });
    assert.equal(decision.code, 'EXISTING_CABLE');
    assert.equal(decision.cable?.materialNumber, testMat2);
  });

  // Test 15: Regression check for unapproved cable
  it('Test 15: Cable in DRAFT status (testMat1 V2) evaluates to CONFIGURATION_REQUIRED', async () => {
    const decision = await evaluatePersistedCable({
      materialNumber: testMat1,
      family: 'LV',
      voltage: '600/1000V',
      conductor: 'Copper',
      conductorSize: 16,
      cores: 1,
      insulation: 'XLPE',
    });
    assert.equal(decision.code, 'CONFIGURATION_REQUIRED');
  });
});
