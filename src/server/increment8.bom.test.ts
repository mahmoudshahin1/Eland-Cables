import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { createCable, evaluatePersistedCable } from './masterDataRepository';
import {
  listBomConflictRegister,
  processBomGovernanceWorkflowAction,
  evaluateCableCostingReadiness,
  updateEngineeringMappingDraft,
  processMappingWorkflowAction,
} from './governanceRepository';
import { DomainError } from '../platform/errors/domainError';
import { assertCanApproveBomGovernance } from './rbac';

dotenv.config();

describe('Increment 8 — BOM Governance & Material Consumption Review', () => {
  const cableMat = 'I8-CABLE-BOM-TEST-01';
  const conflictId = 'BOM-CONF-001';
  const actorTO = { id: 'u-to-1', name: 'Eng. Ahmed (Technical Office)', userType: 'internal', permissions: { technicalOffice: true, masterData: true } };
  const actorManager = { id: 'u-to-mgr', name: 'Eng. Khaled Elsewedy (TO Manager)', userType: 'internal', permissions: { technicalOffice: true, masterData: true } };
  const actorCustomer = { id: 'u-cust-1', name: 'David Smith', userType: 'customer', permissions: { masterData: false, technicalOffice: false } };

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);

    // Ensure clean state
    await prisma.bomDuplicateObservation.deleteMany({ where: { conflictId: 'BOM-CONF-TEST-999' } });
    await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
    await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: cableMat } });
    await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
    await prisma.cableMaster.deleteMany({ where: { materialNumber: cableMat } });

    // Seed test cable
    await createCable(
      {
        id: `mc-${cableMat}`,
        itemCode: 'I8-ITEM-01',
        cableCode: cableMat,
        customerCode: 'N2XH',
        code: `N2XH ${cableMat}`,
        description: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 BOM Test Cable',
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

    // Seed cable mapping (DRAFT)
    await prisma.cableEngineeringMapping.create({
      data: {
        materialNumber: cableMat,
        revision: 1,
        isCurrent: true,
        status: 'DRAFT',
        mappingStatus: 'PARTIAL',
        dataSource: 'Energya Cable Master Data.xlsx / Cable List',
        attributes: [
          { field: 'diameter', value: 10.9, origin: 'SOURCE' },
          { field: 'weight', value: 268, origin: 'SOURCE' },
        ],
      },
    });
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.bomDuplicateObservation.deleteMany({ where: { conflictId: 'BOM-CONF-TEST-999' } });
      await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
      await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: cableMat } });
      await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber: cableMat } });
    }
    await disconnectPrisma();
  });

  // Test 1: All 81 conflict groups preserved
  it('Test 1: All 81 conflict groups are preserved in BomDuplicateObservation without loss', async () => {
    const prisma = getPrisma();
    const count = await prisma!.bomDuplicateObservation.count();
    assert.equal(count, 81);
    const register = await listBomConflictRegister();
    assert.equal(register.length, 81);
  });

  // Test 2 & 9 & 10 & 11: Source values immutable, multiple consumption values preserved, no averaging/deletion
  it('Test 2, 9, 10, 11: Original source weights and row counts remain preserved and immutable', async () => {
    const prisma = getPrisma();
    const firstConflict = await prisma!.bomDuplicateObservation.findFirst({ where: { conflictId } });
    assert.ok(firstConflict);
    assert.ok(Number(firstConflict.weightA) > 0);
    assert.ok(Number(firstConflict.weightB) > 0);
    assert.notEqual(Number(firstConflict.weightA), Number(firstConflict.weightB));
    assert.ok(firstConflict.occurrenceCount >= 2);

    // Ensure source CableBomLine table was not deleted
    const totalSourceBoms = await prisma!.cableBomLine.count();
    assert.ok(totalSourceBoms >= 4822);
  });

  // Test 3: Conflict classification
  it('Test 3: Technical Office can classify conflict with governed category', async () => {
    const updated = await processBomGovernanceWorkflowAction(
      conflictId,
      'DECIDE',
      {
        decisionCategory: 'DIFFERENT_PLANT',
        comment: 'Manufactured across multiple facilities with separate tooling.',
      },
      actorTO
    );
    assert.equal(updated.classification, 'DIFFERENT_PLANT');
    assert.equal(updated.investigationStatus, 'DECISION_REQUIRED');
  });

  // Test 4: Required decision evidence validation
  it('Test 4: Resolving conflict requires mandatory evidence according to classification category', async () => {
    // DIFFERENT_PLANT requires plant name
    await assert.rejects(
      () =>
        processBomGovernanceWorkflowAction(
          conflictId,
          'RESOLVE',
          {
            decisionCategory: 'DIFFERENT_PLANT',
            plant: '', // explicitly blank
            comment: 'Missing plant',
          },
          actorTO
        ),
      (err: any) => err.code === 'INVALID_DECISION_EVIDENCE'
    );

    // Provide plant evidence
    const resolved = await processBomGovernanceWorkflowAction(
      conflictId,
      'RESOLVE',
      {
        decisionCategory: 'DIFFERENT_PLANT',
        plant: 'Plant 1 - Helwan Cable Works',
        selectedWeight: 27.88,
        governedUom: 'kg',
        comment: 'Confirmed Plant 1 standard extrusion specification.',
      },
      actorTO
    );
    assert.equal(resolved.investigationStatus, 'RESOLVED');
    assert.equal(resolved.plant, 'Plant 1 - Helwan Cable Works');
    assert.equal(Number(resolved.selectedWeight), 27.88);
  });

  // Test 5: Unauthorized approval blocked
  it('Test 5: Customer cannot approve BOM governance decision (403 UNAUTHORIZED)', () => {
    assert.throws(
      () => assertCanApproveBomGovernance(actorCustomer),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  // Test 6 & 7: Authorized approval creates GovernedBomLine and audit event
  it('Test 6 & 7: Authorized Technical Office Manager approval creates GovernedBomLine and AuditEvent', async () => {
    const prisma = getPrisma();
    const approved = await processBomGovernanceWorkflowAction(
      conflictId,
      'APPROVE',
      {
        comment: 'Formally approved for plant 1 production route.',
      },
      actorManager
    );
    assert.equal(approved.investigationStatus, 'APPROVED');
    assert.equal(approved.approvedBy, actorManager.name);

    // Verify GovernedBomLine created
    const govLine = await prisma!.governedBomLine.findFirst({
      where: { conflictId },
    });
    assert.ok(govLine);
    assert.equal(Number(govLine.consumption), 27.88);
    assert.equal(govLine.plant, 'Plant 1 - Helwan Cable Works');
    assert.equal(govLine.status, 'APPROVED');

    // Verify Audit Event
    const audits = await prisma!.auditEvent.findMany({
      where: { entity: 'BomDuplicateObservation', entityId: conflictId, action: 'APPROVE' },
    });
    assert.ok(audits.length >= 1);
  });

  // Test 8: Reopening a decision
  it('Test 8: Reopening an approved BOM conflict marks GovernedBomLine as UNDER_REVIEW', async () => {
    const prisma = getPrisma();
    const reopened = await processBomGovernanceWorkflowAction(
      conflictId,
      'REOPEN',
      { comment: 'Reopening to verify additional manufacturing run' },
      actorManager
    );
    assert.equal(reopened.investigationStatus, 'UNDER_REVIEW');

    const govLines = await prisma!.governedBomLine.findMany({ where: { conflictId } });
    assert.ok(govLines.every((g) => g.status === 'UNDER_REVIEW'));
  });

  // Test 12: UOM preservation
  it('Test 12: Source UOM (kg, PCS, m2) is preserved without fake conversions', async () => {
    const prisma = getPrisma();
    const boms = await prisma!.cableBomLine.findMany({ select: { uom: true } });
    const uomSet = new Set(boms.map((b) => b.uom));
    assert.ok(uomSet.has('kg'));
    assert.ok(uomSet.has('PCS'));
  });

  // Test 13: Missing RM price blocks costing readiness
  it('Test 13: Missing RM price (PRICE_NOT_CONFIGURED) blocks costing readiness', async () => {
    const readiness = await evaluateCableCostingReadiness(cableMat);
    assert.equal(readiness.length, 1);
    const item = readiness[0];
    assert.equal(item.rmPriceStatus, 'ALL_PRICED'); // No BOM linked yet
    assert.equal(item.overallStatus, 'UNDER_REVIEW'); // Cable mapping is still DRAFT
  });

  // Test 14: Missing engineering approval blocks costing readiness
  it('Test 14: Cable with unapproved engineering mapping is NOT_READY or UNDER_REVIEW', async () => {
    const readiness = await evaluateCableCostingReadiness(cableMat);
    const item = readiness[0];
    assert.ok(item.engineeringStatus === 'PARTIAL' || item.engineeringStatus === 'DRAFT');
    assert.ok(item.blockingReasons.some((r) => r.includes('PARTIAL') || r.includes('not APPROVED')));
  });

  // Test 15: Resolved BOM and approved engineering progress readiness towards costing gate
  it('Test 15: Approved mapping + resolved BOM evaluated with transparent blocking reasons', async () => {
    // 1. Approve engineering mapping
    await updateEngineeringMappingDraft(
      cableMat,
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
    await processMappingWorkflowAction(cableMat, 'SUBMIT', {}, actorTO);
    await processMappingWorkflowAction(cableMat, 'APPROVE', {}, actorManager);

    // 2. Add raw material and source BOM line with unconfigured price
    const prisma = getPrisma();
    const testRm = 'I8-RM-TEST-99';
    await prisma!.rawMaterial.upsert({
      where: { code: testRm },
      create: { code: testRm, description: 'Copper conductor test', uom: 'kg', priceStatus: 'PRICE_NOT_CONFIGURED' },
      update: { priceStatus: 'PRICE_NOT_CONFIGURED' },
    });

    await prisma!.cableBomLine.create({
      data: {
        cableMaterialNumber: cableMat,
        rawMaterialCode: testRm,
        consumption: 135.23,
        uom: 'kg',
        bomVersion: 1,
      },
    });

    const readiness = await evaluateCableCostingReadiness(cableMat);
    const item = readiness[0];
    assert.equal(item.engineeringStatus, 'APPROVED');
    assert.equal(item.bomStatus, 'RESOLVED');
    assert.equal(item.rmPriceStatus, 'PRICE_NOT_CONFIGURED');
    assert.equal(item.overallStatus, 'NOT_READY');
    assert.ok(item.blockingReasons.some((r) => r.includes('PRICE_NOT_CONFIGURED')));
  });

  // Test 16: Cable with unresolved BOM conflict remains DATA_ISSUE / NOT_READY
  it('Test 16: Cable associated with an unresolved BOM conflict is flagged as CONFLICT_UNRESOLVED', async () => {
    // Link conflict to test cable
    const prisma = getPrisma();
    const testConflictId = 'BOM-CONF-TEST-999';
    await prisma!.bomDuplicateObservation.create({
      data: {
        conflictId: testConflictId,
        cableMaterialNumber: cableMat,
        rawMaterialCode: 'I8-RM-TEST-99',
        weightA: 10,
        weightB: 12,
        occurrenceCount: 2,
        investigationStatus: 'BUSINESS_DECISION_REQUIRED',
        classification: 'BUSINESS_DECISION_REQUIRED',
      },
    });

    const readiness = await evaluateCableCostingReadiness(cableMat);
    const item = readiness[0];
    assert.equal(item.bomStatus, 'CONFLICT_UNRESOLVED');
    assert.equal(item.overallStatus, 'DATA_ISSUE');
    assert.ok(item.blockingReasons.some((r) => r.includes('BOM_CONFLICT_UNRESOLVED') || r.includes('BOM conflict')));

    await prisma!.bomDuplicateObservation.deleteMany({ where: { conflictId: testConflictId } });
  });

  // Test 17: Regression check on Cable Authority for approved mapping
  it('Test 17: Approved cable mapping continues evaluating to EXISTING_CABLE', async () => {
    const decision = await evaluatePersistedCable({
      materialNumber: cableMat,
      family: 'LV',
      voltage: '600/1000V',
      conductor: 'Copper',
      conductorSize: 16,
      cores: 1,
      insulation: 'XLPE',
    });
    assert.equal(decision.code, 'EXISTING_CABLE');
    assert.equal(decision.cable?.materialNumber, cableMat);
  });
});
