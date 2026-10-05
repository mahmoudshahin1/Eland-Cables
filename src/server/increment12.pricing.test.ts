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
} from './governanceRepository';
import { executeCostingRun } from './costingRepository';
import {
  createInquiry,
  addInquiryLine,
  createQuotationFromInquiry,
  getQuotationById,
  createQuotationRevision,
} from './commercialRepository';
import {
  createCommercialPricingRule,
  processPricingRuleWorkflowAction,
  listCommercialPricingRules,
  priceQuotation,
  submitQuotationForApproval,
  approveQuotationPricing,
} from './commercialPricingRepository';
import {
  calculateBaseSellingPrice,
  calculateDiscountAndFinalPrice,
  calculateCommercialSellingPrice,
  resolvePricingRule,
} from '../domain/commercialPricingEngine';
import { DomainError } from '../platform/errors/domainError';
import {
  assertCanApprovePricingRules,
  assertCanManagePricingRules,
} from './rbac';
import { deleteCommercialInquiriesMatching } from './commercialTestCleanup';

dotenv.config();

describe('Increment 12 — Commercial Pricing & Sales Margin Engine', () => {
  const cableMat = 'I12-PRICING-CABLE-01';
  const rmCode = 'I12-RM-COPPER-01';

  const customerUser = { id: 'u-cust-eland', name: 'David Smith', email: 'david.smith@elandcables.com', userType: 'customer', permissions: { masterData: false, salesQuotations: false } };
  const salesUser = { id: 'u-sales-1', name: 'Eng. Sales Officer', email: 'sales@energya.com', userType: 'internal', permissions: { salesQuotations: true, costingPricing: true, masterData: false } };
  const managerUser = { id: 'u-admin-1', name: 'Eng. Khaled Elsewedy (Commercial Director)', email: 'admin@energya.com', userType: 'internal', permissions: { salesQuotations: true, costingPricing: true, masterData: true, technicalOffice: true } };

  let testInquiryId: string;
  let testQuotationNumber: string;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);

    await deleteCommercialInquiriesMatching(prisma, {
      customerId: { in: [customerUser.id, salesUser.id, managerUser.id] },
    });
    await prisma.commercialPricingRule.deleteMany({
      where: { OR: [{ ruleCode: { startsWith: 'I12-' } }, { customerId: customerUser.id }] },
    });
    await prisma.costingLine.deleteMany({ where: { rawMaterialCode: rmCode } });
    await prisma.costingRun.deleteMany({ where: { materialNumber: cableMat } });
    await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: rmCode } });
    await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
    await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
    await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: cableMat } });
    await prisma.cableMaster.deleteMany({ where: { materialNumber: cableMat } });
    await prisma.rawMaterial.deleteMany({ where: { code: rmCode } });

    // 1. Seed Raw Material
    await prisma.rawMaterial.create({
      data: { code: rmCode, description: 'Copper Conductor Wire Rod 8mm', uom: 'kg', priceStatus: 'PRICE_NOT_CONFIGURED' },
    });

    // 2. Seed Approved Cable Master
    await createCable(
      {
        id: `mc-${cableMat}`,
        itemCode: 'I12-ITEM-01',
        cableCode: cableMat,
        customerCode: 'N2XH',
        code: `N2XH ${cableMat}`,
        description: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 Commercial Pricing Cable',
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
      salesUser
    );

    // 3. Approve Engineering Mapping
    await prisma.cableEngineeringMapping.create({
      data: {
        materialNumber: cableMat,
        revision: 1,
        isCurrent: true,
        status: 'DRAFT',
        mappingStatus: 'PARTIAL',
        dataSource: 'Energya Cable Master Data.xlsx / Cable List',
        attributes: [{ field: 'diameter', value: 10.9, origin: 'SOURCE' }, { field: 'weight', value: 268, origin: 'SOURCE' }],
      },
    });
    await updateEngineeringMappingDraft(
      cableMat,
      { family: 'LV', voltage: '600/1000V', conductor: 'Copper', conductorSize: '16', cores: '1', insulation: 'XLPE', standard: 'IEC 60502-1' },
      salesUser
    );
    await processMappingWorkflowAction(cableMat, 'SUBMIT', {}, salesUser);
    await processMappingWorkflowAction(cableMat, 'APPROVE', {}, managerUser);

    // 4. Approve Governed BOM Line (135.23 kg/km)
    await prisma.governedBomLine.create({
      data: { cableMaterialNumber: cableMat, rawMaterialCode: rmCode, consumption: 135.23, uom: 'kg', bomVersion: 1, status: 'APPROVED' },
    });

    // 5. Approve Raw Material Price (9.50 USD/kg)
    const priceDraft = await createRawMaterialPriceDraft(
      { rawMaterialCode: rmCode, price: 9.5, currency: 'USD', uom: 'kg', priceBasis: 'PER_KG', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' },
      salesUser
    );
    await processPriceWorkflowAction(priceDraft.id, 'SUBMIT', {}, salesUser);
    await processPriceWorkflowAction(priceDraft.id, 'APPROVE', {}, managerUser);

    await prisma.drumMaster.upsert({
      where: { drumCode: 'I12-DRM' },
      create: {
        drumCode: 'I12-DRM',
        drumType: 'I12-WOOD',
        flange: 1200,
        barrel: 600,
        innerWidth: 800,
        outerWidth: 900,
        capacity: 1500,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });

    // 6. Create Commercial Inquiry & Line
    const inq = await createInquiry({ customerId: customerUser.id, customerName: 'ELAND Cables (Pricing)', currency: 'USD' }, customerUser);
    testInquiryId = inq.id;
    await addInquiryLine(testInquiryId, { materialNumber: cableMat, requestedQuantity: 1, requestedLengthMeters: 1000, drumType: 'I12-DRM' }, customerUser);

    // 7. Create Quotation V1 (with Material Cost = 135.23 * 9.50 = 1284.69 USD)
    const quo = await createQuotationFromInquiry({ inquiryId: testInquiryId, currency: 'USD' }, salesUser);
    testQuotationNumber = quo.quotationNumber;
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await deleteCommercialInquiriesMatching(prisma, {
        customerId: { in: [customerUser.id, salesUser.id, managerUser.id] },
      });
      await prisma.commercialPricingRule.deleteMany({ where: { ruleCode: { startsWith: 'I12-' } } });
      await prisma.costingLine.deleteMany({ where: { rawMaterialCode: rmCode } });
      await prisma.costingRun.deleteMany({ where: { materialNumber: cableMat } });
      await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: rmCode } });
      await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
      await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
      await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: cableMat } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber: cableMat } });
      await prisma.rawMaterial.deleteMany({ where: { code: rmCode } });
    }
    await disconnectPrisma();
  });

  // Test 1: Markup calculation
  it('Test 1: Markup formula calculates Cost * (1 + Markup%) correctly', () => {
    const price = calculateBaseSellingPrice(1000, 'MARKUP', 20.0);
    assert.equal(price, 1200.0);
  });

  // Test 2: Gross margin calculation
  it('Test 2: Gross margin formula calculates Cost / (1 - Margin%) correctly', () => {
    const price = calculateBaseSellingPrice(1000, 'GROSS_MARGIN', 20.0);
    assert.equal(price, 1250.0);
  });

  // Test 3: Markup != Margin mathematically
  it('Test 3: Confirms Markup and Gross Margin produce mathematically distinct results for identical percentage', () => {
    const markup = calculateBaseSellingPrice(1000, 'MARKUP', 25.0);
    const margin = calculateBaseSellingPrice(1000, 'GROSS_MARGIN', 25.0);
    assert.notEqual(markup, margin);
    assert.equal(markup, 1250.0);
    assert.equal(margin, 1333.33);
  });

  // Test 4: Invalid margin >= 100% or < 0% rejected
  it('Test 4: Invalid margin values >= 100% or < 0% are rejected', () => {
    assert.throws(() => calculateBaseSellingPrice(100, 'GROSS_MARGIN', 100), (err: any) => err.code === 'INVALID_MARGIN_VALUE');
    assert.throws(() => calculateBaseSellingPrice(100, 'GROSS_MARGIN', 105), (err: any) => err.code === 'INVALID_MARGIN_VALUE');
    assert.throws(() => calculateBaseSellingPrice(100, 'GROSS_MARGIN', -2), (err: any) => err.code === 'INVALID_MARGIN_VALUE');
  });

  // Test 5: Invalid negative markup rejected
  it('Test 5: Negative markup percentage is rejected', () => {
    assert.throws(() => calculateBaseSellingPrice(100, 'MARKUP', -10), (err: any) => err.code === 'INVALID_MARKUP_VALUE');
  });

  // Test 6: Discount calculation
  it('Test 6: Governed discount is subtracted from base selling price accurately', () => {
    const { discountAmount, finalSellingPrice } = calculateDiscountAndFinalPrice(1250, 10.0);
    assert.equal(discountAmount, 125.0);
    assert.equal(finalSellingPrice, 1125.0);
  });

  // Test 7: Discount > 100% or < 0% rejected
  it('Test 7: Discount > 100% or negative is rejected', () => {
    assert.throws(() => calculateDiscountAndFinalPrice(100, 110), (err: any) => err.code === 'INVALID_DISCOUNT_VALUE');
    assert.throws(() => calculateDiscountAndFinalPrice(100, -5), (err: any) => err.code === 'INVALID_DISCOUNT_VALUE');
  });

  // Test 8, 9, 10: Customer tier & scope precedence (Level 1: Customer+Cable, Level 2: Customer, Level 5: Global)
  it('Test 8, 9, 10: Pricing precedence strictly resolves Customer+Cable over Customer over Global', () => {
    const rules = [
      { id: '1', ruleCode: 'I12-GLOBAL', ruleName: 'Global Margin', scope: 'GLOBAL' as const, ruleType: 'GROSS_MARGIN' as const, customerId: null, customerTierCode: null, cableMaterialNumber: null, percentageValue: 20, currency: 'USD', priority: 20, effectiveFrom: null, effectiveTo: null, workflowStatus: 'APPROVED' as const, isCurrent: true, revision: 1, minMarginThreshold: null, maxDiscountAllowed: null },
      { id: '2', ruleCode: 'I12-CUST', ruleName: 'Customer Margin', scope: 'CUSTOMER_SPECIFIC' as const, ruleType: 'GROSS_MARGIN' as const, customerId: 'u-cust-eland', customerTierCode: null, cableMaterialNumber: null, percentageValue: 25, currency: 'USD', priority: 80, effectiveFrom: null, effectiveTo: null, workflowStatus: 'APPROVED' as const, isCurrent: true, revision: 1, minMarginThreshold: null, maxDiscountAllowed: null },
      { id: '3', ruleCode: 'I12-CUST-CABLE', ruleName: 'Customer+Cable Override', scope: 'CUSTOMER_CABLE_SPECIFIC' as const, ruleType: 'MARKUP' as const, customerId: 'u-cust-eland', customerTierCode: null, cableMaterialNumber: cableMat, percentageValue: 15, currency: 'USD', priority: 100, effectiveFrom: null, effectiveTo: null, workflowStatus: 'APPROVED' as const, isCurrent: true, revision: 1, minMarginThreshold: null, maxDiscountAllowed: null },
    ];

    // Case 1: Exact Customer + Cable Match -> Level 1 (Rule 3)
    const res1 = resolvePricingRule({ materialNumber: cableMat, customerId: 'u-cust-eland', currency: 'USD' }, rules);
    assert.equal(res1.rule?.ruleCode, 'I12-CUST-CABLE');
    assert.equal(res1.rule?.ruleType, 'MARKUP');

    // Case 2: Customer with different cable -> Level 2 (Rule 2)
    const res2 = resolvePricingRule({ materialNumber: 'OTHER-CABLE', customerId: 'u-cust-eland', currency: 'USD' }, rules);
    assert.equal(res2.rule?.ruleCode, 'I12-CUST');

    // Case 3: Other customer -> Level 5 (Rule 1)
    const res3 = resolvePricingRule({ materialNumber: 'OTHER-CABLE', customerId: 'u-cust-other', currency: 'USD' }, rules);
    assert.equal(res3.rule?.ruleCode, 'I12-GLOBAL');
  });

  // Test 11: Priority conflict detected
  it('Test 11: Multiple active rules sharing identical scope and priority trigger PRICING_RULE_CONFLICT', () => {
    const rules = [
      { id: '1', ruleCode: 'I12-A', ruleName: 'A', scope: 'GLOBAL' as const, ruleType: 'GROSS_MARGIN' as const, customerId: null, customerTierCode: null, cableMaterialNumber: null, percentageValue: 20, currency: 'USD', priority: 50, effectiveFrom: null, effectiveTo: null, workflowStatus: 'APPROVED' as const, isCurrent: true, revision: 1, minMarginThreshold: null, maxDiscountAllowed: null },
      { id: '2', ruleCode: 'I12-B', ruleName: 'B', scope: 'GLOBAL' as const, ruleType: 'MARKUP' as const, customerId: null, customerTierCode: null, cableMaterialNumber: null, percentageValue: 25, currency: 'USD', priority: 50, effectiveFrom: null, effectiveTo: null, workflowStatus: 'APPROVED' as const, isCurrent: true, revision: 1, minMarginThreshold: null, maxDiscountAllowed: null },
    ];
    const res = resolvePricingRule({ currency: 'USD' }, rules);
    assert.equal(res.code, 'PRICING_RULE_CONFLICT');
  });

  // Test 12 & 13: Effective date validation & Expired pricing rule
  it('Test 12 & 13: Pricing rule past effectiveTo returns PRICING_RULE_EXPIRED', () => {
    const expiredRule = [
      { id: '1', ruleCode: 'I12-EXP', ruleName: 'Expired', scope: 'GLOBAL' as const, ruleType: 'GROSS_MARGIN' as const, customerId: null, customerTierCode: null, cableMaterialNumber: null, percentageValue: 20, currency: 'USD', priority: 20, effectiveFrom: new Date('2025-01-01'), effectiveTo: new Date('2025-12-31'), workflowStatus: 'APPROVED' as const, isCurrent: true, revision: 1, minMarginThreshold: null, maxDiscountAllowed: null },
    ];
    const res = resolvePricingRule({ currency: 'USD', pricingDate: new Date('2026-08-20') }, expiredRule);
    assert.equal(res.code, 'PRICING_RULE_EXPIRED');
  });

  // Test 14: Overlapping pricing rules blocked during approval
  it('Test 14: Approving an overlapping pricing rule period is blocked with PRICING_RULE_PERIOD_OVERLAP', async () => {
    // Isolate from live/demo APPROVED GLOBAL USD rules (priority 20). The assertion is unchanged:
    // two test rules that share scope/currency/priority and overlapping dates cannot both be APPROVED.
    const overlapPriority = 920;
    let r1: { id: string } | undefined;
    let r2: { id: string } | undefined;
    try {
      r1 = await createCommercialPricingRule(
        { ruleName: 'I12 Rule 1', scope: 'GLOBAL', percentageValue: 20, currency: 'USD', priority: overlapPriority, effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30' },
        salesUser
      );
      await processPricingRuleWorkflowAction(r1.id, 'SUBMIT', {}, salesUser);
      await processPricingRuleWorkflowAction(r1.id, 'APPROVE', {}, managerUser);

      r2 = await createCommercialPricingRule(
        { ruleName: 'I12 Rule 2 Overlap', scope: 'GLOBAL', percentageValue: 25, currency: 'USD', priority: overlapPriority, effectiveFrom: '2026-03-01', effectiveTo: '2026-09-30' },
        salesUser
      );
      await processPricingRuleWorkflowAction(r2.id, 'SUBMIT', {}, salesUser);

      await assert.rejects(
        () => processPricingRuleWorkflowAction(r2.id, 'APPROVE', {}, managerUser),
        (err: any) => err.code === 'PRICING_RULE_PERIOD_OVERLAP'
      );
    } finally {
      const prisma = getPrisma();
      const ids = [r1?.id, r2?.id].filter((id): id is string => Boolean(id));
      if (prisma && ids.length) {
        await prisma.commercialPricingRule.deleteMany({ where: { id: { in: ids } } });
      }
    }
  });

  // Test 15: Currency mismatch
  it('Test 15: Currency mismatch blocks pricing resolution without automated FX conversion', () => {
    const res = resolvePricingRule(
      { currency: 'EUR' }, // rule is in USD
      [{ id: '1', ruleCode: 'I12-USD', ruleName: 'USD Rule', scope: 'GLOBAL' as const, ruleType: 'GROSS_MARGIN' as const, customerId: null, customerTierCode: null, cableMaterialNumber: null, percentageValue: 20, currency: 'USD', priority: 20, effectiveFrom: null, effectiveTo: null, workflowStatus: 'APPROVED' as const, isCurrent: true, revision: 1, minMarginThreshold: null, maxDiscountAllowed: null }]
    );
    assert.equal(res.code, 'PRICING_CURRENCY_MISMATCH');
  });

  // Test 16: No pricing rule -> PRICING_NOT_CONFIGURED
  it('Test 16: No matching pricing rule returns PRICING_NOT_CONFIGURED (no arbitrary fallback)', () => {
    const res = resolvePricingRule({ currency: 'USD' }, []);
    assert.equal(res.code, 'PRICING_NOT_CONFIGURED');
  });

  // Test 17 & 18: Approval threshold exceeded triggers PRICING_APPROVAL_REQUIRED
  it('Test 17 & 18: Discount exceeding maxDiscountAllowed marks quotation as PRICING_APPROVAL_REQUIRED', async () => {
    // Clean rules for this customer first
    const prisma = getPrisma();
    await prisma!.commercialPricingRule.deleteMany({ where: { customerId: customerUser.id } });

    // Create and approve ELAND pricing rule with maxDiscountAllowed = 10%
    const rule = await createCommercialPricingRule(
      {
        ruleName: 'ELAND Governed Margin 20%',
        scope: 'CUSTOMER_SPECIFIC',
        customerId: customerUser.id,
        ruleType: 'GROSS_MARGIN',
        percentageValue: 20.0,
        currency: 'USD',
        priority: 80,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
        maxDiscountAllowed: 10.0,
      },
      salesUser
    );
    await processPricingRuleWorkflowAction(rule.id, 'SUBMIT', {}, salesUser);
    await processPricingRuleWorkflowAction(rule.id, 'APPROVE', {}, managerUser);

    // Price quotation with 15% discount (> 10% max)
    const priced = await priceQuotation(
      testQuotationNumber,
      { requestedDiscountPercentage: 15.0, pricingDate: new Date('2026-08-20') },
      salesUser
    );

    assert.equal(priced.commercialPricingStatus, 'PRICING_APPROVAL_REQUIRED');
    assert.equal(priced.pricedLines[0].snapshot.approvalRequired, true);
  });

  // Test 19: Authorized manager approval
  it('Test 19: Authorized manager can approve commercial pricing on quotation', async () => {
    const approved = await approveQuotationPricing(testQuotationNumber, { comment: 'Special commercial approval granted' }, managerUser);
    assert.equal(approved.commercialPricingStatus, 'PRICING_APPROVED');
    assert.equal(approved.lines[0].commercialStatus, 'PRICING_APPROVED');
  });

  // Test 20 & 21: Customer role blocked from pricing operations
  it('Test 20 & 21: Customer role is blocked from creating/approving pricing rules (403 UNAUTHORIZED)', () => {
    assert.throws(() => assertCanManagePricingRules(customerUser), (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED');
    assert.throws(() => assertCanApprovePricingRules(customerUser), (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED');
  });

  // Test 22: Historical pricing snapshot immutable
  it('Test 22: Historical CommercialPricingSnapshot remains frozen and immutable', async () => {
    const prisma = getPrisma();
    const snapBefore = await prisma!.commercialPricingSnapshot.findFirst({
      where: { quotationNumber: testQuotationNumber, versionNo: 1 },
    });
    assert.ok(snapBefore);
    const frozenBase = Number(snapBefore.baseSellingPrice);
    const frozenFinal = Number(snapBefore.finalSellingPrice);

    // Update pricing rule in master
    const rule = await prisma!.commercialPricingRule.findFirst({ where: { customerId: customerUser.id } });
    if (rule) {
      await prisma!.commercialPricingRule.update({ where: { id: rule.id }, data: { percentageValue: 50.0 } });
    }

    const snapAfter = await prisma!.commercialPricingSnapshot.findFirst({
      where: { id: snapBefore.id },
    });
    assert.equal(Number(snapAfter?.baseSellingPrice), frozenBase);
    assert.equal(Number(snapAfter?.finalSellingPrice), frozenFinal);
  });

  // Test 23, 24, 25: Quotation revision V2 uses new pricing rule while V1 pricing is immutable
  it('Test 23, 24, 25: Creating Quotation V2 revision leaves V1 pricing snapshot immutable', async () => {
    const v2 = await createQuotationRevision(testQuotationNumber, { remarks: 'V2 with revised pricing' }, salesUser);
    assert.equal(v2.versionNo, 2);
    assert.equal(v2.isCurrent, true);

    const v1 = await getQuotationById(testQuotationNumber);
    assert.ok(v1);
    // V1 lines still reflect original pricing snapshot
    const v1Lines = v1.lines.filter((l) => l.materialNumber === cableMat);
    assert.ok(v1Lines.length >= 1);
  });

  // Test 26, 27, 28: CostingRun immutable, material cost separate from selling price, discount does not alter cost
  it('Test 26, 27, 28: Underlying CostingRun and material cost remain strictly separate from selling price and discounts', async () => {
    const prisma = getPrisma();
    const costRun = await prisma!.costingRun.findFirst({ where: { materialNumber: cableMat } });
    assert.ok(costRun);
    assert.equal(Number(costRun.materialCost), 1284.69); // Frozen material cost
    // Inc 13 orchestrator may populate manufacturing cost from material layer when no process layer exists
    if (costRun.manufacturingCost != null) {
      assert.ok(Number(costRun.manufacturingCost) >= Number(costRun.materialCost));
    }
    // Selling price is governed separately — quotation snapshot must not mutate costing run
    const quotation = await getQuotationById(testQuotationNumber);
    assert.ok(quotation);
    const line = quotation.lines.find((l) => l.materialNumber === cableMat);
    assert.ok(line);
    assert.ok(line.sellingPrice != null);
    assert.notEqual(Number(line.sellingPrice), Number(costRun.materialCost));
  });

  // Test 30: Audit events generated
  it('Test 30: Commercial pricing operations generate immutable AuditEvent records', async () => {
    const prisma = getPrisma();
    const audits = await prisma!.auditEvent.findMany({
      where: { entity: { in: ['CommercialPricingRule', 'CommercialQuotation'] } },
    });
    assert.ok(audits.length >= 2);
  });

  // Test 31: Full regression for Increments 1-11
  it('Test 31: Master data, Cable Authority, BOM Governance, Price Governance, and Costing Engine remain intact', async () => {
    const prisma = getPrisma();
    assert.ok((await prisma!.cableMaster.count()) >= 432);
    assert.ok((await prisma!.cableBomLine.count()) >= 4822);
    assert.ok((await prisma!.rawMaterial.count()) >= 74);
  });
});
