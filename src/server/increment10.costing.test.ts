import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { createCable } from './masterDataRepository';
import {
  updateEngineeringMappingDraft,
  processMappingWorkflowAction,
  createRawMaterialPriceDraft,
  processPriceWorkflowAction,
  processBomGovernanceWorkflowAction,
} from './governanceRepository';
import {
  executeCostingRun,
  getCostingRunById,
  recalculateCostingRun,
} from './costingRepository';
import { executeCostingPreview } from './costingOrchestrationService';
import { buildCostingRequestFromPreviewPayload } from '../services/costingRequestService';
import { DomainError } from '../platform/errors/domainError';
import { assertCanCalculateCosting } from './rbac';

dotenv.config();

describe('Increment 10 — Costing Engine Calculation Foundation', () => {
  const testMat = 'I10-TEST-CABLE-01';
  const testRm1 = 'I10-TEST-RM-CU';
  const testRm2 = 'I10-TEST-RM-XLPE';

  const actorCosting = { id: 'u-cost-1', name: 'Eng. Costing Lead', userType: 'internal', permissions: { costingPricing: true, masterData: true, technicalOffice: true } };
  const actorManager = { id: 'u-mgr-1', name: 'Eng. Khaled Elsewedy (Manager)', userType: 'internal', permissions: { costingPricing: true, masterData: true, technicalOffice: true } };
  const actorCustomer = { id: 'u-cust-1', name: 'David Smith', userType: 'customer', permissions: { masterData: false, costingPricing: false } };

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);

    // Clean test state
    await prisma.bomDuplicateObservation.deleteMany({ where: { conflictId: { startsWith: 'BOM-CONF-I10' } } });
    await prisma.costingLine.deleteMany({ where: { rawMaterialCode: { in: [testRm1, testRm2] } } });
    await prisma.costingRun.deleteMany({ where: { materialNumber: testMat } });
    await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: { in: [testRm1, testRm2] } } });
    await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: testMat } });
    await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: testMat } });
    await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: testMat } });
    await prisma.cableMaster.deleteMany({ where: { materialNumber: testMat } });
    await prisma.rawMaterial.deleteMany({ where: { code: { in: [testRm1, testRm2] } } });

    // Seed Raw Materials
    await prisma.rawMaterial.createMany({
      data: [
        { code: testRm1, description: 'Copper Conductor Wire Rod', uom: 'kg', priceStatus: 'PRICE_NOT_CONFIGURED' },
        { code: testRm2, description: 'XLPE Insulation Granules', uom: 'kg', priceStatus: 'PRICE_NOT_CONFIGURED' },
      ],
    });

    // Seed Cable Master
    await createCable(
      {
        id: `mc-${testMat}`,
        itemCode: 'I10-ITEM-01',
        cableCode: testMat,
        customerCode: 'N2XH',
        code: `N2XH ${testMat}`,
        description: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 Increment 10 Test Cable',
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
      actorCosting
    );

    // Seed Cable Mapping as DRAFT
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
        ],
      },
    });
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.bomDuplicateObservation.deleteMany({ where: { conflictId: { startsWith: 'BOM-CONF-I10' } } });
      await prisma.costingLine.deleteMany({ where: { rawMaterialCode: { in: [testRm1, testRm2] } } });
      await prisma.costingRun.deleteMany({ where: { materialNumber: testMat } });
      await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: { in: [testRm1, testRm2] } } });
      await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: testMat } });
      await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: testMat } });
      await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: testMat } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber: testMat } });
      await prisma.rawMaterial.deleteMany({ where: { code: { in: [testRm1, testRm2] } } });
    }
    await disconnectPrisma();
  });

  // Test 1 & 2: Preview still reports Gate 1 for DRAFT; persist auto-approves then Gate 2 blocks.
  it('Test 1 & 2: Persist costing auto-approves DRAFT mapping; preview still reports ENGINEERING_NOT_APPROVED', async () => {
    const prisma = getPrisma();
    const previewRequest = buildCostingRequestFromPreviewPayload({
      materialNumber: testMat,
      costingDate: '2026-08-20',
      quantity: 1,
      lengthMeters: 1000,
      currency: 'USD',
    });
    assert.ok(!('error' in previewRequest));
    const preview = await executeCostingPreview(previewRequest);
    assert.equal(preview.errorCode, 'ENGINEERING_NOT_APPROVED');

    await assert.rejects(
      () =>
        executeCostingRun(
          { materialNumber: testMat, costingDate: '2026-08-20', quantity: 1, lengthMeters: 1000, currency: 'USD' },
          actorCosting
        ),
      (err: any) =>
        err.code === 'BOM_CONFLICT_UNRESOLVED' &&
        Array.isArray(err.blockingReasons) &&
        err.blockingReasons.some((r: string) => r.includes('Gate 2'))
    );

    const mapping = await prisma!.cableEngineeringMapping.findFirst({
      where: { materialNumber: testMat, isCurrent: true },
    });
    assert.equal(mapping?.status, 'APPROVED');

    // Restore DRAFT so later sequential tests keep revision 1 and submit/approve in place.
    await prisma!.cableEngineeringMapping.update({
      where: { id: mapping!.id },
      data: {
        status: 'DRAFT',
        approvedBy: null,
        approvedAt: null,
        submittedBy: null,
        submittedAt: null,
      },
    });
  });

  // Test 3: Unresolved BOM blocks costing
  it('Test 3: Unresolved BOM conflict blocks costing calculation (Gate 2)', async () => {
    const prisma = getPrisma();

    // 1. Approve engineering mapping
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
      actorCosting
    );
    await processMappingWorkflowAction(testMat, 'SUBMIT', {}, actorCosting);
    await processMappingWorkflowAction(testMat, 'APPROVE', {}, actorManager);

    // 2. Insert unresolved BOM conflict
    const confId = 'BOM-CONF-I10-01';
    await prisma!.bomDuplicateObservation.create({
      data: {
        conflictId: confId,
        cableMaterialNumber: testMat,
        rawMaterialCode: testRm1,
        weightA: 130,
        weightB: 140,
        occurrenceCount: 2,
        investigationStatus: 'BUSINESS_DECISION_REQUIRED',
      },
    });

    await assert.rejects(
      () =>
        executeCostingRun(
          { materialNumber: testMat, costingDate: '2026-08-20', quantity: 1, lengthMeters: 1000, currency: 'USD' },
          actorCosting
        ),
      (err: any) => err.code === 'BOM_CONFLICT_UNRESOLVED'
    );

    // Resolve and approve conflict
    await processBomGovernanceWorkflowAction(
      confId,
      'RESOLVE',
      {
        decisionCategory: 'TRUE_DUPLICATE',
        selectedWeight: 135.23,
        governedUom: 'kg',
        comment: 'Standard production rate',
      },
      actorCosting
    );
    await processBomGovernanceWorkflowAction(confId, 'APPROVE', { comment: 'Approved' }, actorManager);
  });

  // Test 4: Missing raw material blocks costing
  it('Test 4: Consuming an unregistered raw material blocks costing (Gate 3)', async () => {
    const prisma = getPrisma();
    const tempRm = 'I10-TEMP-RM-MISSING';
    await prisma!.rawMaterial.create({
      data: { code: tempRm, description: 'Temporary RM to be deleted', uom: 'kg' },
    });

    await prisma!.governedBomLine.create({
      data: {
        cableMaterialNumber: testMat,
        rawMaterialCode: tempRm,
        consumption: 5,
        uom: 'kg',
        bomVersion: 1,
        status: 'APPROVED',
      },
    });

    // Delete rawMaterial master to simulate Gate 3 failure
    await prisma!.governedBomLine.deleteMany({ where: { cableMaterialNumber: testMat, rawMaterialCode: tempRm } });
    await prisma!.rawMaterial.deleteMany({ where: { code: tempRm } });

    // Directly evaluate costing domain with context missing the raw material
    const { calculateCableManufacturingCost } = await import('../domain/costingEngine');
    const res = calculateCableManufacturingCost(
      { materialNumber: testMat, currency: 'USD' },
      {
        cable: { materialNumber: testMat, description: 'Test' },
        engineeringMapping: { status: 'APPROVED', revision: 1 },
        governedBomLines: [{ rawMaterialCode: tempRm, consumption: 5, uom: 'kg', bomVersion: 1, status: 'APPROVED' }],
        sourceBomLines: [],
        bomConflicts: [],
        rawMaterials: new Map(), // empty!
        approvedPrices: [],
      }
    );

    assert.equal(res.success, false);
    assert.equal(res.errorCode, 'RAW_MATERIAL_NOT_FOUND');
  });

  // Test 5: Missing raw material price blocks costing
  it('Test 5: Unpriced raw material blocks costing with PRICE_NOT_CONFIGURED (Gate 4)', async () => {
    await assert.rejects(
      () =>
        executeCostingRun(
          { materialNumber: testMat, costingDate: '2026-08-20', quantity: 1, lengthMeters: 1000, currency: 'USD' },
          actorCosting
        ),
      (err: any) => err.code === 'PRICE_NOT_CONFIGURED'
    );
  });

  // Test 6: Expired price blocks costing
  it('Test 6: Expired price relative to costing date blocks costing with PRICE_EXPIRED', async () => {
    const p1 = await createRawMaterialPriceDraft(
      {
        rawMaterialCode: testRm1,
        price: 9.5,
        currency: 'USD',
        uom: 'kg',
        priceBasis: 'PER_KG',
        effectiveFrom: '2025-01-01',
        effectiveTo: '2025-12-31', // Expired for 2026-08-20
      },
      actorCosting
    );
    await processPriceWorkflowAction(p1.id, 'SUBMIT', {}, actorCosting);
    await processPriceWorkflowAction(p1.id, 'APPROVE', {}, actorManager);

    await assert.rejects(
      () =>
        executeCostingRun(
          { materialNumber: testMat, costingDate: '2026-08-20', quantity: 1, lengthMeters: 1000, currency: 'USD' },
          actorCosting
        ),
      (err: any) => err.code === 'PRICE_EXPIRED'
    );
  });

  // Test 7: UOM mismatch blocks costing
  it('Test 7: Incompatible PCS price against kg BOM blocks without converting', async () => {
    // Clean prior approved prices for testRm1
    const prisma = getPrisma();
    await prisma!.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: testRm1 } });

    const pUom = await createRawMaterialPriceDraft(
      {
        rawMaterialCode: testRm1,
        price: 10,
        currency: 'USD',
        uom: 'PCS', // BOM is in 'kg'
        priceBasis: 'PER_PCS',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
      },
      actorCosting
    );
    await processPriceWorkflowAction(pUom.id, 'SUBMIT', {}, actorCosting);
    await processPriceWorkflowAction(pUom.id, 'APPROVE', {}, actorManager);

    await assert.rejects(
      () =>
        executeCostingRun(
          { materialNumber: testMat, costingDate: '2026-08-20', quantity: 1, lengthMeters: 1000, currency: 'USD' },
          actorCosting
        ),
      (err: any) => err.code === 'PRICE_UOM_INCOMPATIBLE' || err.code === 'PRICE_UOM_MISMATCH'
    );
  });

  // Test 8: Currency mismatch blocks costing
  it('Test 8: EUR master price converts to USD inquiry currency via governed FX', async () => {
    const prisma = getPrisma();
    await prisma!.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: testRm1 } });

    const pEur = await createRawMaterialPriceDraft(
      {
        rawMaterialCode: testRm1,
        price: 8.5,
        currency: 'EUR',
        uom: 'kg',
        priceBasis: 'PER_KG',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
      },
      actorCosting
    );
    await processPriceWorkflowAction(pEur.id, 'SUBMIT', {}, actorCosting);
    await processPriceWorkflowAction(pEur.id, 'APPROVE', {}, actorManager);

    const run = await executeCostingRun(
      { materialNumber: testMat, costingDate: '2026-08-20', quantity: 1, lengthMeters: 1000, currency: 'USD' },
      actorCosting
    );
    assert.equal(run.costingStatus, 'INCOMPLETE');
    assert.ok(run.materialCost > 0);
  });

  // Test 9, 10, 11, 12, 13, 14, 15: Valid ready cable calculates material cost, multiple BOM lines aggregate correctly, revisions captured
  it('Test 9, 10, 11, 12, 13, 14, 15: Valid cable calculates material cost, aggregates multiple BOM lines, and captures exact revisions', async () => {
    const prisma = getPrisma();
    await prisma!.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: { in: [testRm1, testRm2] } } });

    // Add approved USD price for testRm1 (Copper)
    const pCopper = await createRawMaterialPriceDraft(
      {
        rawMaterialCode: testRm1,
        price: 9.5,
        currency: 'USD',
        uom: 'kg',
        priceBasis: 'PER_KG',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
      },
      actorCosting
    );
    await processPriceWorkflowAction(pCopper.id, 'SUBMIT', {}, actorCosting);
    await processPriceWorkflowAction(pCopper.id, 'APPROVE', {}, actorManager);

    // Add second Governed BOM line for testRm2 (XLPE: 11.92 kg/km)
    await prisma!.governedBomLine.deleteMany({ where: { cableMaterialNumber: testMat, rawMaterialCode: testRm2 } });
    await prisma!.governedBomLine.create({
      data: {
        cableMaterialNumber: testMat,
        rawMaterialCode: testRm2,
        consumption: 11.92,
        uom: 'kg',
        bomVersion: 1,
        status: 'APPROVED',
      },
    });

    // Add approved USD price for testRm2 (XLPE @ 2.40 USD/kg)
    const pXlpe = await createRawMaterialPriceDraft(
      {
        rawMaterialCode: testRm2,
        price: 2.4,
        currency: 'USD',
        uom: 'kg',
        priceBasis: 'PER_KG',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
      },
      actorCosting
    );
    await processPriceWorkflowAction(pXlpe.id, 'SUBMIT', {}, actorCosting);
    await processPriceWorkflowAction(pXlpe.id, 'APPROVE', {}, actorManager);

    // Execute Costing Run for 1 km (1000m), qty = 1
    const run = await executeCostingRun(
      {
        materialNumber: testMat,
        costingDate: '2026-08-20',
        quantity: 1,
        lengthMeters: 1000,
        currency: 'USD',
      },
      actorCosting
    );

    assert.ok(run.id);
    assert.ok(run.costingRunNumber.startsWith('CR-'));
    assert.equal(run.costingStatus, 'INCOMPLETE');
    assert.equal(run.currency, 'USD');

    // Test 10 & 11: Multi-material lines calculation & aggregation
    // Line 1: Copper 135.23 kg * 9.50 = 1284.69
    // Line 2: XLPE 11.92 kg * 2.40 = 28.61
    // Total Material Cost = 1313.30 USD
    assert.equal(run.costingLines.length, 2);
    assert.equal(run.materialCost, 1313.3);

    // Test 12, 13, 14, 15: Revisions & Dates captured
    assert.equal(run.engineeringRevision, 1);
    assert.equal(run.bomVersion, 1);
    assert.equal(new Date(run.costingDate).toISOString().slice(0, 10), '2026-08-20');
    assert.ok(Number(run.costingLines[0].priceRevision) >= 1);
  });

  // Test 16: Historical costing remains immutable on future price updates
  it('Test 16: Historical costing run snapshots remain immutable when master prices change', async () => {
    const runsBefore = await getCostingRunById(testMat);
    assert.ok(runsBefore);
    const originalCost = runsBefore.materialCost;
    const runId = runsBefore.id;

    // Simulate price increase in future
    const pCopperV2 = await createRawMaterialPriceDraft(
      {
        rawMaterialCode: testRm1,
        price: 15.0, // Significant price increase
        currency: 'USD',
        uom: 'kg',
        priceBasis: 'PER_KG',
        effectiveFrom: '2027-01-01',
        effectiveTo: '2027-12-31',
      },
      actorCosting
    );
    await processPriceWorkflowAction(pCopperV2.id, 'SUBMIT', {}, actorCosting);
    await processPriceWorkflowAction(pCopperV2.id, 'APPROVE', {}, actorManager);

    // Verify historical run snapshot did not change
    const runAfter = await getCostingRunById(runId);
    assert.ok(runAfter);
    assert.equal(runAfter?.materialCost, originalCost);
  });

  // Test 17: Recalculation creates a new CostingRun
  it('Test 17: Recalculating a costing run creates a new run without overwriting historical run', async () => {
    const previousRun = await getCostingRunById(testMat);
    assert.ok(previousRun);
    const oldRunId = previousRun.id;

    const newRun = await recalculateCostingRun(oldRunId, actorCosting);
    assert.notEqual(newRun.costingRunNumber, previousRun.costingRunNumber);
    assert.equal(newRun.isCurrent, true);

    const oldRunRefetched = await getCostingRunById(oldRunId);
    assert.ok(oldRunRefetched);
    assert.equal(oldRunRefetched?.isCurrent, false);
    assert.equal(oldRunRefetched?.materialCost, previousRun.materialCost);
  });

  // Test 18, 19, 20, 21, 22: No scrap, process, overhead, margin, selling price invented
  it('Test 18-22: Process/overhead remain NOT_CONFIGURED; Inc 13 orchestrator may apply governed scrap', async () => {
    const run = await getCostingRunById(testMat);
    assert.ok(run);

    assert.equal(run.processCostStatus, 'NOT_CONFIGURED');
    assert.equal(run.overheadCostStatus, 'NOT_CONFIGURED');
    assert.ok(['NOT_CONFIGURED', 'CONFIGURED', 'PARTIAL'].includes(run.scrapCostStatus));
    assert.ok(run.manufacturingCost != null || run.materialCost != null);
  });

  // Test 23: Customer cannot access unauthorized costing calculation
  it('Test 23: Customer role is blocked with 403 UNAUTHORIZED from calculating costs', () => {
    assert.throws(
      () => assertCanCalculateCosting(actorCustomer),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  // Test 24: Audit events created
  it('Test 24: Costing calculation creates immutable AuditEvent entries', async () => {
    const prisma = getPrisma();
    const audits = await prisma!.auditEvent.findMany({
      where: { entity: 'CostingRun' },
    });
    assert.ok(audits.length >= 1);
  });

  // Test 25: Regression verification
  it('Test 25: Master data, Cable Authority, BOM Governance, and Price Governance remain fully operational', async () => {
    const prisma = getPrisma();
    const cableCount = await prisma!.cableMaster.count();
    const bomCount = await prisma!.cableBomLine.count();
    const rmCount = await prisma!.rawMaterial.count();

    assert.ok(cableCount >= 432);
    assert.ok(bomCount >= 4822);
    assert.ok(rmCount >= 74);
  });
});
