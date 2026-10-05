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
import {
  addInquiryLine,
  calculateInquiryLineCost,
  createInquiry,
} from './commercialRepository';
import { deleteCommercialInquiriesMatching } from './commercialTestCleanup';
import { executeCostingPreview } from './costingOrchestrationService';
import { buildCostingRequestFromInquiryLine } from '../services/costingRequestService';

dotenv.config();

describe('Increment 13 — multi-currency FX costing', () => {
  const cableMat = 'I13F-FX-CABLE';
  const rmCode = 'I13F-RM-CU';

  const salesUser = {
    id: 'u-sales-fx',
    name: 'Sales FX',
    email: 'sales-fx@energya.com',
    userType: 'internal',
    permissions: { salesQuotations: true, costingPricing: true },
  };

  const managerUser = {
    id: 'u-mgr-fx',
    name: 'Manager FX',
    email: 'mgr-fx@energya.com',
    userType: 'internal',
    permissions: { salesQuotations: true, masterData: true, technicalOffice: true },
  };

  let inquiryId = '';
  let lineId = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);

    await prisma.costingCalculationSnapshot.deleteMany({
      where: { calculation: { materialNumber: cableMat } },
    });
    await prisma.costingCalculation.deleteMany({ where: { materialNumber: cableMat } });
    await prisma.costingLine.deleteMany({ where: { rawMaterialCode: rmCode } });
    await prisma.costingRun.deleteMany({ where: { materialNumber: cableMat } });
    await deleteCommercialInquiriesMatching(prisma, {
      OR: [{ customerId: salesUser.id }, { customerName: 'FX Test Customer' }],
    });
    await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: rmCode } });
    await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
    await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
    await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: cableMat } });
    await prisma.cableMaster.deleteMany({ where: { materialNumber: cableMat } });
    await prisma.rawMaterial.deleteMany({ where: { code: rmCode } });
    await prisma.costingExchangeRate.deleteMany({ where: { code: { startsWith: 'I13F-FX-' } } });

    await prisma.drumMaster.upsert({
      where: { drumCode: 'I13F-DRM' },
      create: {
        drumCode: 'I13F-DRM',
        drumType: 'I13F-WOOD',
        flange: 1200,
        barrel: 600,
        innerWidth: 800,
        outerWidth: 900,
        capacity: 1500,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });

    await prisma.rawMaterial.create({
      data: { code: rmCode, description: 'Copper FX', uom: 'kg', currency: 'USD', priceStatus: 'CONFIGURED' },
    });

    await createCable(
      {
        id: `mc-${cableMat}`,
        itemCode: 'I13F-ITEM',
        cableCode: cableMat,
        customerCode: 'N2XH',
        code: cableMat,
        description: 'FX test cable',
        voltageClass: 'LV',
        conductor: 'Copper',
        cores: '1C',
        crossSectionMm2: 16,
        outerDiameterMm: 10,
        approxWeightKgKm: 200,
        standardPriceUsdPerM: 0,
        priceConfigured: false,
        status: 'ACTIVE',
      },
      salesUser
    );

    await prisma.cableEngineeringMapping.create({
      data: {
        materialNumber: cableMat,
        revision: 1,
        isCurrent: true,
        status: 'DRAFT',
        mappingStatus: 'PARTIAL',
        dataSource: 'test',
        attributes: [],
      },
    });

    await updateEngineeringMappingDraft(
      cableMat,
      { family: 'LV', voltage: '600/1000V', conductor: 'Copper', conductorSize: '16', cores: '1', insulation: 'XLPE' },
      salesUser
    );
    await processMappingWorkflowAction(cableMat, 'SUBMIT', {}, salesUser);
    await processMappingWorkflowAction(cableMat, 'APPROVE', {}, managerUser);

    await prisma.governedBomLine.create({
      data: {
        cableMaterialNumber: cableMat,
        rawMaterialCode: rmCode,
        consumption: 250,
        uom: 'kg',
        bomVersion: 1,
        status: 'APPROVED',
      },
    });

    const priceDraft = await createRawMaterialPriceDraft(
      {
        rawMaterialCode: rmCode,
        price: 8.5,
        currency: 'USD',
        uom: 'kg',
        priceBasis: 'PER_KG',
        effectiveFrom: '2020-01-01',
        effectiveTo: '2030-12-31',
      },
      salesUser
    );
    await processPriceWorkflowAction(priceDraft.id, 'SUBMIT', {}, salesUser);
    await processPriceWorkflowAction(priceDraft.id, 'APPROVE', {}, managerUser);

    const inquiry = await createInquiry(
      {
        customerName: 'FX Test Customer',
        currency: 'LE',
        commercialMetadata: {
          rawMaterialCurrency: 'USD',
          rawMaterialExchangeRate: 50,
          exchangeRate: 50,
        },
      },
      salesUser
    );
    inquiryId = inquiry.id;

    const line = await addInquiryLine(
      inquiryId,
      {
        materialNumber: cableMat,
        cableDescription: 'FX line',
        requestedQuantity: 1,
        requestedLengthMeters: 1000,
        drumType: 'I13F-DRM',
      },
      salesUser
    );
    lineId = line.id;
  });

  after(async () => {
    await disconnectPrisma();
  });

  it('converts USD RM price to LE inquiry currency via rawMaterialExchangeRate', async () => {
    const { result, line } = await calculateInquiryLineCost(inquiryId, lineId, salesUser);
    assert.equal(result.status, 'READY');
    assert.equal(result.resultCurrency, 'LE');
    assert.ok(result.fxSnapshot?.length);
    // 250 kg/km * 1 km * 8.5 USD/kg * 50 = 106250 LE
    assert.equal(result.totals.materialCost, '106250');
    assert.equal(line?.materialCostCurrency, 'LE');
    const breakdown = result.materialBreakdown[0];
    assert.equal(breakdown.originalCurrency, 'USD');
    assert.equal(breakdown.fxRate, 50);
  });

  it('blocks costing when FX is not configured', async () => {
    const request = buildCostingRequestFromInquiryLine(
      { materialNumber: cableMat, requestedQuantity: 1, requestedLengthMeters: 1000 },
      {
        currency: 'SAR',
        inquiryDate: new Date().toISOString(),
        commercialMetadata: { rawMaterialCurrency: 'USD' },
      },
      { previewOnly: true }
    );
    assert.ok(!('error' in request));
    const preview = await executeCostingPreview(request);
    assert.equal(preview.status, 'NOT_READY');
    assert.ok(preview.blockingReasons.some((r) => r.includes('FX_NOT_CONFIGURED')));
  });

  it('does not use DRAFT governed FX; APPROVED EGP→LE alias converts USD price to LE', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    await prisma.costingExchangeRate.deleteMany({ where: { code: 'I13F-FX-USD-SAR' } });
    const row = await prisma.costingExchangeRate.create({
      data: {
        code: 'I13F-FX-USD-SAR',
        name: 'Test USD SAR draft',
        fromCurrency: 'USD',
        toCurrency: 'SAR',
        rate: 3.75,
        workflowStatus: 'DRAFT',
        status: 'ACTIVE',
        isCurrent: true,
        effectiveFrom: new Date('2020-01-01'),
      },
    });

    const request = buildCostingRequestFromInquiryLine(
      { materialNumber: cableMat, requestedQuantity: 1, requestedLengthMeters: 1000 },
      {
        currency: 'SAR',
        inquiryDate: '2026-08-24',
        commercialMetadata: { rawMaterialCurrency: 'USD' },
      },
      { previewOnly: true }
    );
    assert.ok(!('error' in request));
    const draftPreview = await executeCostingPreview(request);
    assert.equal(draftPreview.status, 'NOT_READY');
    assert.ok(draftPreview.blockingReasons.some((r) => r.includes('FX_NOT_CONFIGURED')));

    await prisma.costingExchangeRate.update({
      where: { id: row.id },
      data: { workflowStatus: 'APPROVED' },
    });
    const readyPreview = await executeCostingPreview(request);
    assert.equal(readyPreview.status, 'READY');
    assert.ok(Number(readyPreview.totals.materialCost) > 0);
  });
});
