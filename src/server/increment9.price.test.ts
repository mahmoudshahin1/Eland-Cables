import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { createCable } from './masterDataRepository';
import {
  createRawMaterialPriceDraft,
  processPriceWorkflowAction,
  processBulkPriceApprove,
  listGovernedRawMaterialPrices,
  evaluateCableCostingReadiness,
  updateEngineeringMappingDraft,
  processMappingWorkflowAction,
} from './governanceRepository';
import {
  getValidRawMaterialPrice,
  validatePriceInput,
  detectPricePeriodOverlap,
  priceBasisForConsumptionUom,
} from '../services/rawMaterialPriceGovernanceService';
import { DomainError } from '../platform/errors/domainError';
import { assertCanApproveRawMaterialPrice, assertCanProposeRawMaterialPrice } from './rbac';

dotenv.config();

describe('Increment 9 — Raw Material Price Governance & Costing Readiness', () => {
  const rmCode1 = 'I9-RM-COPPER-01';
  const rmCode2 = 'I9-RM-XLPE-01';
  const cableMat = 'I9-CABLE-TEST-01';

  const actorFinance = { id: 'u-fin-1', name: 'Finance Lead (Procurement)', userType: 'internal', permissions: { costingPricing: true, masterData: true } };
  const actorManager = { id: 'u-mgr-1', name: 'Eng. Khaled Elsewedy (Manager)', userType: 'internal', permissions: { costingPricing: true, masterData: true, technicalOffice: true } };
  const actorCustomer = { id: 'u-cust-1', name: 'David Smith', userType: 'customer', permissions: { masterData: false, costingPricing: false } };

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);

    // Clean test state
    await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: { in: [rmCode1, rmCode2] } } });
    await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: cableMat } });
    await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
    await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
    await prisma.cableMaster.deleteMany({ where: { materialNumber: cableMat } });
    await prisma.rawMaterial.deleteMany({ where: { code: { in: [rmCode1, rmCode2] } } });

    // Seed test Raw Materials
    await prisma.rawMaterial.createMany({
      data: [
        { code: rmCode1, description: 'Electrolytic Copper Rod 8mm', uom: 'kg', priceStatus: 'PRICE_NOT_CONFIGURED' },
        { code: rmCode2, description: 'XLPE Insulation Compound Grade A', uom: 'kg', priceStatus: 'PRICE_NOT_CONFIGURED' },
      ],
    });

    // Seed test cable & mapping
    await createCable(
      {
        id: `mc-${cableMat}`,
        itemCode: 'I9-ITEM-01',
        cableCode: cableMat,
        customerCode: 'N2XH',
        code: `N2XH ${cableMat}`,
        description: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 Readiness Test Cable',
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
      actorFinance
    );

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
      await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: { in: [rmCode1, rmCode2] } } });
      await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: cableMat } });
      await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
      await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber: cableMat } });
      await prisma.rawMaterial.deleteMany({ where: { code: { in: [rmCode1, rmCode2] } } });
    }
    await disconnectPrisma();
  });

  // Test 1: Create price draft
  it('Test 1: Create price draft proposals in DRAFT status', async () => {
    const draft = await createRawMaterialPriceDraft(
      {
        rawMaterialCode: rmCode1,
        price: 9500,
        currency: 'USD',
        uom: 'ton',
        priceBasis: 'PER_TON',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-06-30',
        supplier: 'LME Cash Seller',
        comment: 'Q1-Q2 index price',
      },
      actorFinance
    );

    assert.ok(draft.id);
    assert.equal(draft.workflowStatus, 'DRAFT');
    assert.equal(Number(draft.price), 9500);
    assert.equal(draft.currency, 'USD');
    assert.equal(draft.priceBasis, 'PER_TON');
  });

  // Test 2: Blank price rejected
  it('Test 2: Blank price is rejected with PRICE_NOT_CONFIGURED', () => {
    const val = validatePriceInput(
      { rawMaterialCode: rmCode1, price: null, currency: 'USD' },
      { existingRawMaterialCodes: new Set([rmCode1]) }
    );
    assert.equal(val.valid, false);
    assert.ok(val.errors.some((e) => e.code === 'PRICE_NOT_CONFIGURED'));
  });

  // Test 3: Zero price rejected
  it('Test 3: Zero price (price = 0) is rejected as INVALID_PRICE', () => {
    const val = validatePriceInput(
      { rawMaterialCode: rmCode1, price: 0, currency: 'USD' },
      { existingRawMaterialCodes: new Set([rmCode1]) }
    );
    assert.equal(val.valid, false);
    assert.ok(val.errors.some((e) => e.code === 'INVALID_PRICE'));
  });

  // Test 4: Negative price rejected
  it('Test 4: Negative price is rejected as INVALID_PRICE', () => {
    const val = validatePriceInput(
      { rawMaterialCode: rmCode1, price: -50, currency: 'USD' },
      { existingRawMaterialCodes: new Set([rmCode1]) }
    );
    assert.equal(val.valid, false);
    assert.ok(val.errors.some((e) => e.code === 'INVALID_PRICE'));
  });

  // Test 5: Unknown RM rejected
  it('Test 5: Unknown raw material code is rejected with RAW_MATERIAL_NOT_FOUND', () => {
    const val = validatePriceInput(
      { rawMaterialCode: 'NON-EXISTENT-RM', price: 100, currency: 'USD' },
      { existingRawMaterialCodes: new Set([rmCode1]) }
    );
    assert.equal(val.valid, false);
    assert.ok(val.errors.some((e) => e.code === 'RAW_MATERIAL_NOT_FOUND'));
  });

  // Test 6: Invalid currency rejected
  it('Test 6: Invalid currency string is rejected', () => {
    const val = validatePriceInput(
      { rawMaterialCode: rmCode1, price: 100, currency: 'INVALID_CURRENCY' },
      { existingRawMaterialCodes: new Set([rmCode1]) }
    );
    assert.equal(val.valid, false);
    assert.ok(val.errors.some((e) => e.code === 'INVALID_CURRENCY'));
  });

  // Test 7: Invalid UOM rejected
  it('Test 7: Invalid UOM string is rejected', () => {
    const val = validatePriceInput(
      { rawMaterialCode: rmCode1, price: 100, currency: 'USD', uom: 'UNRECOGNIZED_UOM' },
      { existingRawMaterialCodes: new Set([rmCode1]) }
    );
    assert.equal(val.valid, false);
    assert.ok(val.errors.some((e) => e.code === 'INVALID_UOM'));
  });

  // Test 8: Invalid effective date range rejected
  it('Test 8: Effective From after Effective To is rejected', () => {
    const val = validatePriceInput(
      {
        rawMaterialCode: rmCode1,
        price: 100,
        currency: 'USD',
        effectiveFrom: '2026-12-31',
        effectiveTo: '2026-01-01',
      },
      { existingRawMaterialCodes: new Set([rmCode1]) }
    );
    assert.equal(val.valid, false);
    assert.ok(val.errors.some((e) => e.code === 'INVALID_DATE_RANGE'));
  });

  // Test 9: Overlapping approved price rejected
  it('Test 9: Overlapping approved price periods for identical parameters are detected', () => {
    const overlap = detectPricePeriodOverlap(
      {
        rawMaterialCode: rmCode1,
        currency: 'USD',
        uom: 'ton',
        priceBasis: 'PER_TON',
        effectiveFrom: new Date('2026-03-01'),
        effectiveTo: new Date('2026-05-01'),
      },
      [
        {
          id: 'PR-APPROVED-01',
          rawMaterialCode: rmCode1,
          price: 9000,
          currency: 'USD',
          uom: 'ton',
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: new Date('2026-06-30'),
          supplier: 'LME',
          source: 'Index',
          priceBasis: 'PER_TON',
          workflowStatus: 'APPROVED',
          isCurrent: true,
          revision: 1,
        },
      ]
    );

    assert.equal(overlap.overlap, true);
    assert.equal(overlap.conflictingPrice?.id, 'PR-APPROVED-01');
  });

  // Test 10: Valid price approved
  it('Test 10: Submitting and approving a valid price updates workflowStatus to APPROVED', async () => {
    const list = await listGovernedRawMaterialPrices({ rawMaterialCode: rmCode1 });
    const draft = list[0];
    assert.ok(draft);

    await processPriceWorkflowAction(draft.id, 'SUBMIT', {}, actorFinance);
    const approved = await processPriceWorkflowAction(draft.id, 'APPROVE', { comment: 'Manager sign-off' }, actorManager);

    assert.equal(approved.workflowStatus, 'APPROVED');
    assert.equal(approved.approvedBy, actorManager.name);
  });

  // Test 11: Historical approved price immutable
  it('Test 11: Adding a new price revision preserves historical approved price immutably', async () => {
    // Add V2 for second half of year
    const draftV2 = await createRawMaterialPriceDraft(
      {
        rawMaterialCode: rmCode1,
        price: 9800,
        currency: 'USD',
        uom: 'ton',
        priceBasis: 'PER_TON',
        effectiveFrom: '2026-07-01',
        effectiveTo: '2026-12-31',
        supplier: 'LME Cash Seller',
        comment: 'Q3-Q4 contracted rate',
      },
      actorFinance
    );

    await processPriceWorkflowAction(draftV2.id, 'SUBMIT', {}, actorFinance);
    await processPriceWorkflowAction(draftV2.id, 'APPROVE', {}, actorManager);

    const allPrices = await listGovernedRawMaterialPrices({ rawMaterialCode: rmCode1 });
    assert.equal(allPrices.length, 2);
    assert.ok(allPrices.every((p) => p.workflowStatus === 'APPROVED'));
    assert.equal(allPrices.find((p) => p.revision === 1)?.price, 9500);
    assert.equal(allPrices.find((p) => p.revision === 2)?.price, 9800);
  });

  // Test 12: Expired price detected
  it('Test 12: Price evaluation detects expired pricing when costing date is past effectiveTo', () => {
    const prices = [
      {
        id: 'PR-HIST-01',
        rawMaterialCode: rmCode1,
        price: 9000,
        currency: 'USD',
        uom: 'ton',
        effectiveFrom: new Date('2025-01-01'),
        effectiveTo: new Date('2025-12-31'),
        supplier: null,
        source: null,
        priceBasis: 'PER_TON' as const,
        workflowStatus: 'APPROVED' as const,
        isCurrent: false,
        revision: 1,
      },
    ];

    const result = getValidRawMaterialPrice(rmCode1, new Date('2026-08-20'), 'ton', 'USD', 'PER_TON', prices);
    assert.equal(result.code, 'PRICE_EXPIRED');
  });

  // Test 13: Valid price selected by costing date
  it('Test 13: Correct price record selected matching specific costing date', () => {
    const prices = [
      {
        id: 'PR-H1',
        rawMaterialCode: rmCode1,
        price: 9500,
        currency: 'USD',
        uom: 'ton',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-06-30'),
        supplier: null,
        source: null,
        priceBasis: 'PER_TON' as const,
        workflowStatus: 'APPROVED' as const,
        isCurrent: false,
        revision: 1,
      },
      {
        id: 'PR-H2',
        rawMaterialCode: rmCode1,
        price: 9800,
        currency: 'USD',
        uom: 'ton',
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: new Date('2026-12-31'),
        supplier: null,
        source: null,
        priceBasis: 'PER_TON' as const,
        workflowStatus: 'APPROVED' as const,
        isCurrent: true,
        revision: 2,
      },
    ];

    const marchRes = getValidRawMaterialPrice(rmCode1, new Date('2026-03-15'), 'ton', 'USD', 'PER_TON', prices);
    assert.equal(marchRes.code, 'PRICE_VALID');
    assert.equal(marchRes.price, 9500);

    const augRes = getValidRawMaterialPrice(rmCode1, new Date('2026-08-20'), 'ton', 'USD', 'PER_TON', prices);
    assert.equal(augRes.code, 'PRICE_VALID');
    assert.equal(augRes.price, 9800);
  });

  // Test 14: Missing price blocks readiness
  it('maps PCS BOM consumption to PER_PCS so piece items are not looked up as PER_KG', () => {
    assert.equal(priceBasisForConsumptionUom('PCS'), 'PER_PCS');
    assert.equal(priceBasisForConsumptionUom('kg'), 'PER_KG');
  });

  it('Test 14: Unpriced raw material blocks costing readiness with PRICE_NOT_CONFIGURED', () => {
    const result = getValidRawMaterialPrice(rmCode2, new Date('2026-08-20'), 'kg', 'USD', 'PER_KG', []);
    assert.equal(result.code, 'PRICE_NOT_CONFIGURED');
    assert.equal(result.message, `No approved price configured for Raw Material ${rmCode2}.`);
  });

  it('mentions an existing DRAFT price instead of implying the material has no price row', () => {
    const result = getValidRawMaterialPrice(rmCode1, new Date('2026-08-20'), 'kg', 'USD', 'PER_KG', [
      {
        id: 'P-DRAFT',
        rawMaterialCode: rmCode1,
        price: 1900,
        currency: 'USD',
        uom: 'kg',
        effectiveFrom: null,
        effectiveTo: null,
        supplier: null,
        source: null,
        priceBasis: 'PER_KG',
        workflowStatus: 'DRAFT',
        isCurrent: true,
        revision: 1,
      },
    ]);
    assert.equal(result.code, 'PRICE_NOT_CONFIGURED');
    assert.match(result.message, /DRAFT price exists/);
    assert.match(result.message, /1,900 USD \/ kg/);
    assert.match(result.message, /Costing Team/);
  });

  // Test 15: Expired price blocks readiness
  it('Test 15: Expired price blocks readiness evaluation', async () => {
    const result = getValidRawMaterialPrice(
      rmCode1,
      new Date('2027-01-01'),
      'ton',
      'USD',
      'PER_TON',
      [
        {
          id: 'P1',
          rawMaterialCode: rmCode1,
          price: 100,
          currency: 'USD',
          uom: 'ton',
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: new Date('2026-12-31'),
          supplier: null,
          source: null,
          priceBasis: 'PER_TON',
          workflowStatus: 'APPROVED',
          isCurrent: true,
          revision: 1,
        },
      ]
    );
    assert.equal(result.code, 'PRICE_EXPIRED');
  });

  // Test 16: UOM mismatch blocks readiness
  it('Test 16: ton price is valid against kg BOM via governed MT→kg conversion', () => {
    const prices = [
      {
        id: 'P1',
        rawMaterialCode: rmCode1,
        price: 9500,
        currency: 'USD',
        uom: 'ton',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-12-31'),
        supplier: null,
        source: null,
        priceBasis: 'PER_TON' as const,
        workflowStatus: 'APPROVED' as const,
        isCurrent: true,
        revision: 1,
      },
    ];

    const res = getValidRawMaterialPrice(rmCode1, new Date('2026-08-20'), 'kg', 'USD', 'PER_KG', prices);
    assert.equal(res.code, 'PRICE_VALID');
    assert.equal(res.price, 9500);
    assert.equal(res.priceRecord?.uom, 'ton');
  });

  it('Test 16b: PCS price is incompatible with kg BOM', () => {
    const prices = [
      {
        id: 'P-PCS',
        rawMaterialCode: rmCode1,
        price: 10,
        currency: 'USD',
        uom: 'PCS',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-12-31'),
        supplier: null,
        source: null,
        priceBasis: 'PER_PCS' as const,
        workflowStatus: 'APPROVED' as const,
        isCurrent: true,
        revision: 1,
      },
    ];
    const res = getValidRawMaterialPrice(rmCode1, new Date('2026-08-20'), 'kg', 'USD', 'PER_PCS', prices);
    assert.equal(res.code, 'PRICE_UOM_INCOMPATIBLE');
  });

  // Test 17: Currency mismatch blocks readiness
  it('Test 17: Currency mismatch blocks readiness without automated FX conversion', () => {
    const prices = [
      {
        id: 'P1',
        rawMaterialCode: rmCode1,
        price: 9500,
        currency: 'EUR',
        uom: 'kg',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-12-31'),
        supplier: null,
        source: null,
        priceBasis: 'PER_KG' as const,
        workflowStatus: 'APPROVED' as const,
        isCurrent: true,
        revision: 1,
      },
    ];

    const res = getValidRawMaterialPrice(rmCode1, new Date('2026-08-20'), 'kg', 'USD', 'PER_KG', prices);
    assert.equal(res.code, 'PRICE_CURRENCY_MISMATCH');
  });

  // Test 18: Missing engineering approval blocks readiness
  it('Test 18: Cable with unapproved engineering mapping is NOT_READY or UNDER_REVIEW', async () => {
    const readiness = await evaluateCableCostingReadiness(cableMat);
    const item = readiness[0];
    assert.ok(item.overallStatus === 'UNDER_REVIEW' || item.overallStatus === 'NOT_READY');
    assert.ok(item.blockingReasons.some((r) => r.includes('Gate 1 Failed')));
  });

  // Test 19: BOM conflict blocks readiness
  it('Test 19: Cable with unapproved BOM conflict fails Gate 2 and is DATA_ISSUE', async () => {
    const prisma = getPrisma();
    const confId = 'BOM-CONF-I9-TEST';
    await prisma!.bomDuplicateObservation.create({
      data: {
        conflictId: confId,
        cableMaterialNumber: cableMat,
        rawMaterialCode: rmCode1,
        weightA: 10,
        weightB: 20,
        occurrenceCount: 2,
        investigationStatus: 'BUSINESS_DECISION_REQUIRED',
      },
    });

    const readiness = await evaluateCableCostingReadiness(cableMat);
    const item = readiness[0];
    assert.equal(item.overallStatus, 'DATA_ISSUE');
    assert.equal(item.bomStatus, 'CONFLICT_UNRESOLVED');
    assert.ok(item.blockingReasons.some((r) => r.includes('Gate 2 Failed')));

    await prisma!.bomDuplicateObservation.deleteMany({ where: { conflictId: confId } });
  });

  // Test 20: Ready cable correctly classified (all 4 gates pass)
  it('Test 20: Cable satisfying all 4 gates is classified as READY_FOR_COSTING', async () => {
    const prisma = getPrisma();

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
      actorManager
    );
    await processMappingWorkflowAction(cableMat, 'SUBMIT', {}, actorManager);
    await processMappingWorkflowAction(cableMat, 'APPROVE', {}, actorManager);

    // 2. Add BOM lines
    await prisma!.cableBomLine.createMany({
      data: [
        { cableMaterialNumber: cableMat, rawMaterialCode: rmCode1, consumption: 135, uom: 'kg', bomVersion: 1 },
      ],
    });

    // 3. Add approved price matching BOM UOM 'kg'
    const priceDraft = await createRawMaterialPriceDraft(
      {
        rawMaterialCode: rmCode1,
        price: 9.5,
        currency: 'USD',
        uom: 'kg',
        priceBasis: 'PER_KG',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
      },
      actorFinance
    );
    await processPriceWorkflowAction(priceDraft.id, 'SUBMIT', {}, actorFinance);
    await processPriceWorkflowAction(priceDraft.id, 'APPROVE', {}, actorManager);

    // 4. Evaluate Costing Readiness
    const readiness = await evaluateCableCostingReadiness(cableMat, new Date('2026-08-20'));
    const item = readiness[0];
    assert.equal(item.engineeringStatus, 'APPROVED');
    assert.equal(item.bomStatus, 'RESOLVED');
    assert.equal(item.rmPriceStatus, 'ALL_PRICED');
    assert.equal(item.overallStatus, 'READY_FOR_COSTING');
    assert.equal(item.blockingReasons.length, 0);
  });

  // Test 21: Customer cannot modify price
  it('Test 21: Customer role blocked from modifying prices (403 UNAUTHORIZED)', () => {
    assert.throws(
      () => assertCanProposeRawMaterialPrice(actorCustomer),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  // Test 22: Unauthorized user cannot approve
  it('Test 22: Unauthorized role blocked from approving prices', () => {
    assert.throws(
      () => assertCanApproveRawMaterialPrice(actorCustomer),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  // Test 23: Approved price creates audit event
  it('Test 23: Approving price creates immutable AuditEvent', async () => {
    const prisma = getPrisma();
    const audits = await prisma!.auditEvent.findMany({
      where: { entity: 'RawMaterialPrice', action: 'APPROVE' },
    });
    assert.ok(audits.length >= 1);
  });

  // Test 24: Excel import validation
  it('Test 24: Excel price import validates unknown RM and bad currency/price', () => {
    const badInput = { rawMaterialCode: 'UNKNOWN_RM', price: -10, currency: 'BAD_CUR' };
    const val = validatePriceInput(badInput, { existingRawMaterialCodes: new Set([rmCode1]) });
    assert.equal(val.valid, false);
    assert.ok(val.errors.some((e) => e.code === 'RAW_MATERIAL_NOT_FOUND'));
    assert.ok(val.errors.some((e) => e.code === 'INVALID_PRICE'));
    assert.ok(val.errors.some((e) => e.code === 'INVALID_CURRENCY'));
  });

  // Test 25: Excel import never creates APPROVED price directly
  it('Test 25: Excel price import creates records in DRAFT status only', async () => {
    const draftFromExcel = await createRawMaterialPriceDraft(
      {
        rawMaterialCode: rmCode2,
        price: 3200,
        currency: 'USD',
        uom: 'kg',
        priceBasis: 'PER_KG',
        effectiveFrom: '2026-01-01',
        source: 'Excel Import: Price_List.xlsx',
        comment: 'Draft from Excel template',
      },
      actorFinance
    );
    assert.equal(draftFromExcel.workflowStatus, 'DRAFT');
  });

  // Test 26: Regression verification
  it('Test 26: Platform components continue functioning with full governance integration', async () => {
    const prices = await listGovernedRawMaterialPrices({ rawMaterialCode: rmCode1 });
    assert.ok(prices.length >= 2);
  });

  it('Bulk approve only processes SUBMITTED prices and skips drafts', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const codes = ['CU-BULK-APP-01', 'CU-BULK-APP-02', 'CU-BULK-APP-03'];
    await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: { in: codes } } });
    await prisma.rawMaterial.deleteMany({ where: { code: { in: codes } } });
    await prisma.rawMaterial.createMany({
      data: codes.map((code) => ({ code, description: code, uom: 'kg', priceStatus: 'PRICE_NOT_CONFIGURED' })),
    });
    try {
      const drafts = await Promise.all(
        codes.map((code) =>
          createRawMaterialPriceDraft(
            {
              rawMaterialCode: code,
              price: 12.5,
              currency: 'USD',
              uom: 'kg',
              priceBasis: 'PER_KG',
              effectiveFrom: '2026-01-01',
            },
            actorFinance
          )
        )
      );
      await processPriceWorkflowAction(drafts[0].id, 'SUBMIT', {}, actorFinance);
      await processPriceWorkflowAction(drafts[1].id, 'SUBMIT', {}, actorFinance);
      const result = await processBulkPriceApprove([drafts[0].id, drafts[1].id, drafts[2].id], actorManager);
      assert.equal(result.approvedCount, 2);
      assert.equal(result.skippedCount, 1);
      assert.equal(result.skipped[0].reason, 'NOT_PENDING');
      const remaining = await listGovernedRawMaterialPrices({ rawMaterialCode: codes[2] });
      assert.equal(remaining[0]?.workflowStatus, 'DRAFT');
    } finally {
      await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: { in: codes } } });
      await prisma.rawMaterial.deleteMany({ where: { code: { in: codes } } });
    }
  });
});
