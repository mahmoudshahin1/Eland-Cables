import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import http from 'node:http';
import express from 'express';
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
  calculateInquiryCost,
  calculateInquiryLineCost,
  createInquiry,
  createQuotationFromInquiry,
  getInquiryById,
  getInquiryLineCosting,
  getQuotationCosting,
  submitInquiry,
  updateInquiry,
  updateInquiryLine,
} from './commercialRepository';
import { projectInquiryForActor } from './commercialProjection';
import { buildCostingRequestFromInquiryLine, buildLayerInputsFromCommercialMetadata } from '../services/costingRequestService';
import { inquiriesRouter } from './commercialRoutes';
import { signTestToken } from './auth';
import { attachTechnicalOfferToAllInquiryLines } from './attachTechnicalOfferTestHelper';
import { deleteCommercialInquiriesMatching } from './commercialTestCleanup';

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

describe('Increment 13 — Phase E inquiry costing integration', () => {
  const runSuffix = `i13e-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const cableMat = 'I13E-PHASE-E-CABLE';
  const rmCode = 'I13E-RM-CU';
  const ownedInquiryIds: string[] = [];

  const customer = {
    id: `u-cust-phase-e-${runSuffix}`,
    name: `Phase E Customer ${runSuffix}`,
    email: `phasee-${runSuffix}@elandcables.com`,
    userType: 'customer',
    permissions: { salesQuotations: false },
  };

  const salesUser = {
    id: 'u-sales-phase-e',
    name: 'Sales Phase E',
    email: 'sales-phase-e@energya.com',
    userType: 'internal',
    permissions: { salesQuotations: true, costingPricing: true },
  };

  const managerUser = {
    id: 'u-mgr-phase-e',
    name: 'Manager Phase E',
    email: 'mgr-phase-e@energya.com',
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
      OR: [
        { customerId: { startsWith: 'u-cust-phase-e' } },
        { customerName: { startsWith: 'Phase E Customer' } },
      ],
    });
    await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: rmCode } });
    await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
    await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
    await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: cableMat } });
    await prisma.cableMaster.deleteMany({ where: { materialNumber: cableMat } });
    await prisma.rawMaterial.deleteMany({ where: { code: rmCode } });

    await prisma.drumMaster.upsert({
      where: { drumCode: 'I13E-DRM' },
      create: {
        drumCode: 'I13E-DRM',
        drumType: 'I13E-WOOD',
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
      data: { code: rmCode, description: 'Copper Phase E', uom: 'kg', priceStatus: 'CONFIGURED' },
    });

    await createCable(
      {
        id: `mc-${cableMat}`,
        itemCode: 'I13E-ITEM',
        cableCode: cableMat,
        customerCode: 'N2XH',
        code: cableMat,
        description: 'Phase E test cable',
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
      {
        family: 'LV',
        voltage: '600/1000V',
        conductor: 'Copper',
        conductorSize: '16',
        cores: '1',
        insulation: 'XLPE',
        standard: 'IEC 60502-1',
      },
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
        customerName: customer.name,
        commercialMetadata: { copperPriceRate: 9500, aluminiumPriceRate: 2400 },
      },
      customer
    );
    inquiryId = inquiry.id;
    ownedInquiryIds.push(inquiryId);

    const line = await addInquiryLine(
      inquiryId,
      {
        materialNumber: cableMat,
        cableDescription: 'Phase E line',
        requestedQuantity: 1,
        requestedLengthMeters: 1000,
        cuttingLengthMeters: 1000,
        drumType: 'I13E-DRM',
      },
      customer
    );
    lineId = line.id;
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await deleteCommercialInquiriesMatching(prisma, { id: { in: ownedInquiryIds } });
      await prisma.costingCalculationSnapshot.deleteMany({
        where: { calculation: { materialNumber: cableMat } },
      });
      await prisma.costingCalculation.deleteMany({ where: { materialNumber: cableMat } });
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

  it('buildLayerInputsFromCommercialMetadata snapshots header metal rates', () => {
    const inputs = buildLayerInputsFromCommercialMetadata({
      copperPriceRate: 9500,
      aluminiumPriceRate: 2400,
    });
    assert.equal(inputs?.COPPER_PRICE_RATE, '9500');
    assert.equal(inputs?.ALUMINIUM_PRICE_RATE, '2400');
  });

  it('buildCostingRequestFromInquiryLine passes header incoterms and destination', () => {
    const request = buildCostingRequestFromInquiryLine(
      { materialNumber: cableMat, requestedQuantity: 1, requestedLengthMeters: 1000 },
      {
        currency: 'USD',
        incoterms: 'DAP',
        commercialMetadata: {
          deliveryDestination: 'Felixstowe',
          copperPriceRate: 9500,
          aluminiumPriceRate: 2400,
        },
      }
    );
    assert.ok(!('error' in request));
    assert.equal(request.commercialMetadata?.incoterms, 'DAP');
    assert.equal(request.commercialMetadata?.deliveryDestination, 'Felixstowe');
  });

  it('buildCostingRequestFromInquiryLine passes cutting length and drum to orchestrator metadata', () => {
    const request = buildCostingRequestFromInquiryLine(
      {
        materialNumber: cableMat,
        requestedQuantity: 2,
        requestedLengthMeters: 500,
        cuttingLengthMeters: 400,
        drumType: 'I13E-DRM',
      },
      { currency: 'USD' }
    );
    assert.ok(!('error' in request));
    assert.equal(request.lengthMeters, 800);
    assert.equal(request.commercialMetadata?.cuttingLengthMeters, 400);
    assert.equal(request.commercialMetadata?.drumType, 'I13E-DRM');
  });

  it('calculateInquiryLineCost persists CostingCalculation when READY', async () => {
    const { result, line } = await calculateInquiryLineCost(inquiryId, lineId, salesUser);
    assert.equal(result.status, 'READY');
    assert.ok(result.calculationId);
    assert.ok(line?.costingCalculationId);
    assert.ok(line?.materialCost != null);
  });

  it('calculateInquiryLineCost returns DRUM_CONFIGURATION_REQUIRED when drum is not on Drum Master', async () => {
    const draftInquiry = await createInquiry(
      {
        customerName: customer.name,
        commercialMetadata: { copperPriceRate: 9500, aluminiumPriceRate: 2400 },
      },
      customer
    );
    ownedInquiryIds.push(draftInquiry.id);
    const noDrum = await addInquiryLine(
      draftInquiry.id,
      {
        materialNumber: cableMat,
        cableDescription: 'Missing drum',
        requestedQuantity: 1,
        requestedLengthMeters: 1000,
      },
      customer
    );
    await assert.rejects(
      () => calculateInquiryLineCost(draftInquiry.id, noDrum.id, salesUser),
      (err: Error & { code?: string }) => err.code === 'DRUM_CONFIGURATION_REQUIRED'
    );
  });

  it('calculateInquiryLineCost auto-approves DRAFT engineering mapping', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    await prisma.cableEngineeringMapping.updateMany({
      where: { materialNumber: cableMat, isCurrent: true },
      data: { status: 'DRAFT', approvedBy: null, approvedAt: null },
    });

    const { result } = await calculateInquiryLineCost(inquiryId, lineId, salesUser);
    assert.equal(result.status, 'READY');
    assert.ok(result.calculationId);

    const mapping = await prisma.cableEngineeringMapping.findFirst({
      where: { materialNumber: cableMat, isCurrent: true },
    });
    assert.equal(mapping?.status, 'APPROVED');
    assert.ok(mapping?.approvedAt);
  });

  it('calculateInquiryLineCost still blocks REJECTED engineering mapping', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    await prisma.cableEngineeringMapping.updateMany({
      where: { materialNumber: cableMat, isCurrent: true },
      data: { status: 'REJECTED' },
    });
    try {
      await assert.rejects(
        () => calculateInquiryLineCost(inquiryId, lineId, salesUser),
        (err: Error & { code?: string }) => err.code === 'ENGINEERING_NOT_APPROVED'
      );
    } finally {
      await prisma.cableEngineeringMapping.updateMany({
        where: { materialNumber: cableMat, isCurrent: true },
        data: { status: 'APPROVED' },
      });
    }
  });

  it('getInquiryLineCosting returns breakdown snapshot', async () => {
    const costing = await getInquiryLineCosting(inquiryId, lineId, salesUser);
    assert.equal(costing.status, 'READY');
    assert.ok(costing.calculation);
    assert.ok(costing.breakdown);
    const breakdown = costing.breakdown as {
      extensionLayers?: { logistics?: { status?: string; amount?: number | null } };
      incotermChargeStatus?: string;
    };
    const logistics = breakdown.extensionLayers?.logistics;
    assert.ok(logistics);
    if (logistics.status === 'CONFIGURED') {
      assert.equal(typeof logistics.amount, 'number');
      assert.equal(breakdown.incotermChargeStatus, 'CONFIGURED');
    } else {
      assert.equal(logistics.status, 'NOT_CONFIGURED');
      assert.equal(logistics.amount ?? null, null);
      assert.equal(breakdown.incotermChargeStatus, 'NOT_CONFIGURED');
    }
  });

  it('customer projection hides internal costing fields including material cost', async () => {
    const inquiry = await getInquiryById(inquiryId);
    assert.ok(inquiry);
    const projected = projectInquiryForActor(inquiry, customer);
    const line = projected.lines?.[0];
    assert.ok(line);
    assert.equal(line.costingRunId, undefined);
    assert.equal(line.costingReadinessStatus, undefined);
    assert.equal(line.materialCost, undefined);
    assert.equal(line.costingCalculationId, undefined);
    assert.equal((line as Record<string, unknown>).costingCalculated, true);
  });

  it('updateInquiryLine marks costing stale on qty change', async () => {
    const updated = await updateInquiryLine(
      inquiryId,
      lineId,
      { requestedQuantity: 2 },
      customer
    );
    assert.equal(updated.costingReadinessStatus, 'STALE');
    assert.equal(updated.materialCost, null);
  });

  it('applies configured logistics rule cost and does not invent unmatched shipping', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const code = `I13E-LOG-${Date.now()}`;
    await prisma.costingLogisticsRule.create({
      data: {
        code,
        name: 'CIF Alexandria test',
        incoterm: 'CIF',
        destination: 'Alexandria',
        cost: 125.5,
        currency: 'USD',
        workflowStatus: 'ACTIVE',
        status: 'ACTIVE',
        isCurrent: true,
      },
    });

    try {
      await updateInquiry(
        inquiryId,
        {
          incoterms: 'CIF',
          commercialMetadata: {
            copperPriceRate: 9500,
            aluminiumPriceRate: 2400,
            deliveryDestination: 'Alexandria',
            incoterms: 'CIF',
          },
        },
        salesUser
      );
      await calculateInquiryLineCost(inquiryId, lineId, salesUser);
      const matched = await getInquiryLineCosting(inquiryId, lineId, salesUser);
      const matchedBreakdown = matched.breakdown as {
        extensionLayers?: { logistics?: { status?: string; amount?: number | null; ruleCode?: string | null } };
        incotermChargeStatus?: string;
      };
      assert.equal(matchedBreakdown.extensionLayers?.logistics?.status, 'CONFIGURED');
      assert.equal(Number(matchedBreakdown.extensionLayers?.logistics?.amount), 125.5);
      assert.equal(matchedBreakdown.incotermChargeStatus, 'CONFIGURED');

      await updateInquiry(
        inquiryId,
        {
          incoterms: 'CIF',
          commercialMetadata: {
            copperPriceRate: 9500,
            aluminiumPriceRate: 2400,
            deliveryDestination: 'UnknownPort',
            incoterms: 'CIF',
          },
        },
        salesUser
      );
      await calculateInquiryLineCost(inquiryId, lineId, salesUser);
      const unmatched = await getInquiryLineCosting(inquiryId, lineId, salesUser);
      const unmatchedBreakdown = unmatched.breakdown as {
        extensionLayers?: { logistics?: { status?: string; amount?: number | null } };
        incotermChargeStatus?: string;
      };
      assert.equal(unmatchedBreakdown.extensionLayers?.logistics?.status, 'NOT_CONFIGURED');
      assert.equal(unmatchedBreakdown.extensionLayers?.logistics?.amount ?? null, null);
      assert.equal(unmatchedBreakdown.incotermChargeStatus, 'NOT_CONFIGURED');
      const unmatchedLine = await getInquiryById(inquiryId);
      assert.ok(unmatchedLine?.lines?.[0]?.materialCost != null);
    } finally {
      await prisma.costingLogisticsRule.deleteMany({ where: { code } });
    }
  });

  it('calculate without material number returns BOM_NOT_READY', async () => {
    const draftInquiry = await createInquiry({ customerName: customer.name }, customer);
    ownedInquiryIds.push(draftInquiry.id);
    const line = await addInquiryLine(
      draftInquiry.id,
      { cableDescription: 'No material line' },
      customer
    );
    await assert.rejects(
      () => calculateInquiryLineCost(draftInquiry.id, line.id, salesUser),
      (err: Error & { code?: string }) => err.code === 'BOM_NOT_READY'
    );
  });

  it('calculateInquiryCost runs every line and reports structured codes', async () => {
    const draftInquiry = await createInquiry(
      {
        customerName: customer.name,
        incoterms: 'FOB',
        commercialMetadata: { copperPriceRate: 9500, aluminiumPriceRate: 2400, deliveryDestination: 'UK' },
      },
      customer
    );
    ownedInquiryIds.push(draftInquiry.id);
    const mapped = await addInquiryLine(
      draftInquiry.id,
      {
        materialNumber: cableMat,
        cableDescription: 'Mapped calculate-all',
        requestedQuantity: 1,
        requestedLengthMeters: 1000,
        drumType: 'I13E-DRM',
      },
      customer
    );
    const unmapped = await addInquiryLine(
      draftInquiry.id,
      { cableDescription: 'Unmapped calculate-all' },
      customer
    );
    const { lines, inquiry: calculated } = await calculateInquiryCost(draftInquiry.id, salesUser);
    assert.equal(lines.length, 2);
    const mappedResult = lines.find((row) => row.lineId === mapped.id);
    const unmappedResult = lines.find((row) => row.lineId === unmapped.id);
    assert.ok(mappedResult);
    assert.ok(unmappedResult);
    assert.equal(mappedResult.status, 'READY');
    assert.equal(mappedResult.code, 'READY');
    assert.equal(mappedResult.persisted, true);
    const logistics = (mappedResult.result as { extensionLayers?: { logistics?: { status?: string; amount?: number | null } } })
      ?.extensionLayers?.logistics;
    assert.ok(logistics);
    if (logistics.status !== 'CONFIGURED') {
      assert.equal(logistics.status, 'NOT_CONFIGURED');
      assert.equal(logistics.amount ?? null, null);
    }
    assert.equal(unmappedResult.status, 'NOT_READY');
    assert.equal(unmappedResult.code, 'BOM_NOT_READY');
    const persistedMapped = calculated?.lines.find((line) => line.id === mapped.id);
    assert.ok(persistedMapped?.costingCalculationId);
  });

  it('submitInquiry locks recalculation', async () => {
    await calculateInquiryLineCost(inquiryId, lineId, salesUser);
    await attachTechnicalOfferToAllInquiryLines(inquiryId);
    await submitInquiry(inquiryId, salesUser);

    await assert.rejects(
      () => calculateInquiryLineCost(inquiryId, lineId, salesUser),
      (err: Error & { code?: string }) => err.code === 'COSTING_LOCKED'
    );
  });

  it('submitInquiry rejects mapped lines without calculation', async () => {
    const draftInquiry = await createInquiry(
      {
        customerName: customer.name,
        commercialMetadata: { copperPriceRate: 9500, aluminiumPriceRate: 2400 },
      },
      customer
    );
    ownedInquiryIds.push(draftInquiry.id);
    const line = await addInquiryLine(
      draftInquiry.id,
      { cableDescription: 'Uncalculated', materialNumber: cableMat },
      customer
    );
    assert.ok(line.materialNumber);
    const prisma = getPrisma();
    assert.ok(prisma);
    await prisma.commercialInquiryLine.update({
      where: { id: line.id },
      data: {
        costingCalculationId: null,
        materialCost: null,
        costingReadinessStatus: 'NOT_READY',
      },
    });
    await assert.rejects(
      () => submitInquiry(draftInquiry.id, customer),
      (err: Error & { code?: string }) => err.code === 'CALCULATION_REQUIRED'
    );
  });

  it('createQuotationFromInquiry copies costingCalculationId snapshot per line', async () => {
    const quotation = await createQuotationFromInquiry({ inquiryId }, salesUser);
    assert.ok(quotation.lines?.length);
    const qLine = quotation.lines[0];
    assert.ok(qLine.costingCalculationId);
    assert.ok(qLine.costingRunId);
    const costing = await getQuotationCosting(quotation.quotationNumber, salesUser);
    assert.equal(costing.lines[0].costingCalculationId, qLine.costingCalculationId);
    assert.ok(costing.lines[0].calculation);
    await assert.rejects(
      () => getQuotationCosting(quotation.quotationNumber, customer),
      (err: Error & { code?: string }) => err.code === 'UNAUTHORIZED'
    );
  });

  it('POST /api/inquiries/:id/calculate-cost is registered and does not 404', async () => {
    const draftInquiry = await createInquiry(
      {
        customerName: customer.name,
        incoterms: 'FOB',
        commercialMetadata: { copperPriceRate: 9500, aluminiumPriceRate: 2400, deliveryDestination: 'UK' },
      },
      customer
    );
    ownedInquiryIds.push(draftInquiry.id);
    const mapped = await addInquiryLine(
      draftInquiry.id,
      {
        materialNumber: cableMat,
        cableDescription: 'HTTP calculate-all mapped',
        requestedQuantity: 1,
        requestedLengthMeters: 1000,
        drumType: 'I13E-DRM',
      },
      customer
    );
    const unmapped = await addInquiryLine(
      draftInquiry.id,
      { cableDescription: 'HTTP calculate-all unmapped' },
      customer
    );

    const app = express();
    app.use(express.json());
    app.use('/api/inquiries', inquiriesRouter);
    app.use('/api', (req, res) =>
      res.status(404).json({ error: 'API route not found.', method: req.method, path: req.originalUrl })
    );
    const listening = await listen(app);
    try {
      const missing = await fetch(`${listening.base}/api/inquiries/${draftInquiry.id}/calculate-costing`, {
        method: 'POST',
      });
      assert.equal(missing.status, 404);

      const unauth = await fetch(`${listening.base}/api/inquiries/${draftInquiry.id}/calculate-cost`, {
        method: 'POST',
      });
      assert.equal(unauth.status, 401);

      const token = signTestToken(salesUser);
      const res = await fetch(`${listening.base}/api/inquiries/${draftInquiry.id}/calculate-cost`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      assert.notEqual(res.status, 404);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.lines.length, 2);
      const mappedRow = body.lines.find((row: { lineId: string }) => row.lineId === mapped.id);
      const unmappedRow = body.lines.find((row: { lineId: string }) => row.lineId === unmapped.id);
      assert.ok(mappedRow);
      assert.ok(unmappedRow);
      assert.equal(mappedRow.status, 'READY');
      assert.equal(mappedRow.code, 'READY');
      assert.equal(unmappedRow.status, 'NOT_READY');
      assert.equal(unmappedRow.code, 'BOM_NOT_READY');
      const persisted = (body.inquiry?.lines || []).find((line: { id: string }) => line.id === mapped.id);
      assert.ok(persisted?.materialCost != null);

      const customerToken = signTestToken(customer);
      const customerRes = await fetch(`${listening.base}/api/inquiries/${draftInquiry.id}/calculate-cost`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      });
      assert.equal(customerRes.status, 200);
      const customerBody = await customerRes.json();
      const customerLine = (customerBody.inquiry?.lines || []).find((line: { id: string }) => line.id === mapped.id);
      assert.ok(customerLine);
      assert.equal(customerLine.materialCost, undefined);
      assert.equal(customerLine.materialCostCurrency, undefined);
    } finally {
      await new Promise<void>((resolve, reject) =>
        listening.server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
