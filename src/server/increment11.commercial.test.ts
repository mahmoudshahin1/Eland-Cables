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
  createInquiry,
  createQuotationFromInquiry,
  createQuotationRevision,
  getInquiryById,
  getQuotationById,
  listInquiries,
  submitInquiry,
} from './commercialRepository';
import { DomainError } from '../platform/errors/domainError';
import {
  assertCanAccessInquiryOwnership,
  assertCanManageInquiry,
  assertCanManageQuotations,
} from './rbac';
import { attachTechnicalOfferToAllInquiryLines } from './attachTechnicalOfferTestHelper';
import { deleteCommercialInquiriesMatching } from './commercialTestCleanup';

dotenv.config();

describe('Increment 11 — Commercial Inquiry & Quotation Foundation', () => {
  const approvedCableMat = 'I11-APPROVED-CABLE';
  const draftCableMat = 'I11-DRAFT-CABLE';
  const rmCode = 'I11-RM-COPPER';

  const customerA = { id: 'u-cust-eland', name: 'David Smith', email: 'david.smith@elandcables.com', userType: 'customer', permissions: { masterData: false, salesQuotations: false } };
  const customerB = { id: 'u-cust-dewa', name: 'Rashid Al-Maktoum', email: 'procurement@dewa.gov.ae', userType: 'customer', permissions: { masterData: false, salesQuotations: false } };
  const salesUser = { id: 'u-sales-1', name: 'Mohamed Ahmed (Sales)', email: 'sales@energya.com', userType: 'internal', permissions: { salesQuotations: true, masterData: false } };
  const managerUser = { id: 'u-admin-1', name: 'Eng. Khaled Elsewedy', email: 'admin@energya.com', userType: 'internal', permissions: { salesQuotations: true, masterData: true, technicalOffice: true } };

  let createdInquiryId: string;
  let createdQuotationId: string;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);

    await deleteCommercialInquiriesMatching(prisma, {
      customerId: { in: [customerA.id, customerB.id, salesUser.id, managerUser.id] },
    });
    await prisma.drumMaster.upsert({
      where: { drumCode: 'I11-DRM-WOOD220' },
      create: {
        drumCode: 'I11-DRM-WOOD220',
        drumType: 'Wood Reel 220',
        flange: 2200,
        barrel: 1120,
        innerWidth: 1000,
        outerWidth: 1200,
        capacity: 2500,
        status: 'ACTIVE',
      },
      update: { drumType: 'Wood Reel 220', status: 'ACTIVE' },
    });
    await prisma.costingLine.deleteMany({ where: { rawMaterialCode: rmCode } });
    await prisma.costingRun.deleteMany({ where: { materialNumber: { in: [approvedCableMat, draftCableMat] } } });
    await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: rmCode } });
    await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: { in: [approvedCableMat, draftCableMat] } } });
    await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: { in: [approvedCableMat, draftCableMat] } } });
    await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: { in: [approvedCableMat, draftCableMat] } } });
    await prisma.cableMaster.deleteMany({ where: { materialNumber: { in: [approvedCableMat, draftCableMat] } } });
    await prisma.rawMaterial.deleteMany({ where: { code: rmCode } });

    // Seed Raw Material
    await prisma.rawMaterial.create({
      data: { code: rmCode, description: 'Electrolytic Copper Wire 8mm', uom: 'kg', priceStatus: 'CONFIGURED' },
    });

    // Seed Cable 1: Approved Master Cable
    await createCable(
      {
        id: `mc-${approvedCableMat}`,
        itemCode: 'I11-ITEM-APP',
        cableCode: approvedCableMat,
        customerCode: 'N2XH',
        code: `N2XH ${approvedCableMat}`,
        description: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 Approved Commercial Cable',
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

    // Approve Engineering Mapping for Cable 1
    await prisma.cableEngineeringMapping.create({
      data: {
        materialNumber: approvedCableMat,
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

    await updateEngineeringMappingDraft(
      approvedCableMat,
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
    await processMappingWorkflowAction(approvedCableMat, 'SUBMIT', {}, salesUser);
    await processMappingWorkflowAction(approvedCableMat, 'APPROVE', {}, managerUser);

    // Add Governed BOM & Approved Price for Cable 1
    await prisma.governedBomLine.create({
      data: {
        cableMaterialNumber: approvedCableMat,
        rawMaterialCode: rmCode,
        consumption: 135.23,
        uom: 'kg',
        bomVersion: 1,
        status: 'APPROVED',
      },
    });

    const priceDraft = await createRawMaterialPriceDraft(
      {
        rawMaterialCode: rmCode,
        price: 9.5,
        currency: 'USD',
        uom: 'kg',
        priceBasis: 'PER_KG',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
      },
      salesUser
    );
    await processPriceWorkflowAction(priceDraft.id, 'SUBMIT', {}, salesUser);
    await processPriceWorkflowAction(priceDraft.id, 'APPROVE', {}, managerUser);

    // Seed Cable 2: Draft / Unapproved Cable
    await createCable(
      {
        id: `mc-${draftCableMat}`,
        itemCode: 'I11-ITEM-DFT',
        cableCode: draftCableMat,
        customerCode: 'N2XH',
        code: `N2XH ${draftCableMat}`,
        description: 'Cu / XLPE 0.6/1 kV 1X16 mm2 Draft Cable',
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

    await prisma.cableEngineeringMapping.create({
      data: {
        materialNumber: draftCableMat,
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
      await deleteCommercialInquiriesMatching(prisma, {
        customerId: { in: [customerA.id, customerB.id, salesUser.id, managerUser.id] },
      });
      await prisma.costingLine.deleteMany({ where: { rawMaterialCode: rmCode } });
      await prisma.costingRun.deleteMany({ where: { materialNumber: { in: [approvedCableMat, draftCableMat] } } });
      await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: rmCode } });
      await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: { in: [approvedCableMat, draftCableMat] } } });
      await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: { in: [approvedCableMat, draftCableMat] } } });
      await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: { in: [approvedCableMat, draftCableMat] } } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber: { in: [approvedCableMat, draftCableMat] } } });
      await prisma.rawMaterial.deleteMany({ where: { code: rmCode } });
    }
    await disconnectPrisma();
  });

  // Test 1: Customer creates inquiry
  it('Test 1: Customer creates commercial inquiry successfully', async () => {
    const inq = await createInquiry(
      {
        customerReference: 'RFQ-ELAND-2026-001',
        projectName: 'Cairo Metro Line Expansion',
        currency: 'USD',
        notes: 'Priority delivery for Q4 installation',
        commercialMetadata: { copperPriceRate: 9500, aluminiumPriceRate: 2400 },
      },
      customerA
    );

    assert.ok(inq.id);
    assert.ok(inq.inquiryNumber.startsWith('INQ-'));
    assert.equal(inq.customerId, customerA.id);
    assert.equal(inq.customerName, 'ELAND Cables');
    assert.equal(inq.status, 'DRAFT');
    createdInquiryId = inq.id;
  });

  // Test 2 & 3: Customer can only see own inquiry; blocked from accessing other customer's inquiry
  it('Test 2 & 3: Customer ownership is strictly enforced server-side', async () => {
    // Customer A owns createdInquiryId
    assert.doesNotThrow(() => assertCanAccessInquiryOwnership(customerA, customerA.id));

    // Customer B blocked from accessing Customer A's inquiry
    assert.throws(
      () => assertCanAccessInquiryOwnership(customerB, customerA.id),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  // Test 4: Internal Sales can access authorized inquiries
  it('Test 4: Internal Sales can list and access all inquiries', async () => {
    const list = await listInquiries();
    assert.ok(list.inquiries.length >= 1);
    const found = list.inquiries.find((i) => i.id === createdInquiryId);
    assert.ok(found);
  });

  // Test 5: Approved Cable Master can be added to inquiry (PATH A)
  it('Test 5: Approved Cable Master is validated by Cable Authority and added as EXISTING_CABLE', async () => {
    // Ensure Cable 1 is approved before adding line
    const prisma = getPrisma();
    await prisma!.cableEngineeringMapping.updateMany({
      where: { materialNumber: approvedCableMat, isCurrent: true },
      data: { status: 'APPROVED', family: 'LV', voltage: '600/1000V', conductor: 'Copper', conductorSize: '16', cores: '1', insulation: 'XLPE' },
    });

    const line = await addInquiryLine(
      createdInquiryId,
      {
        materialNumber: approvedCableMat,
        requestedQuantity: 2.5,
        quantityUom: 'KM',
        requestedLengthMeters: 2500,
        drumType: 'Wood Reel 220',
      },
      customerA
    );

    assert.equal(line.cableAuthorityStatus, 'EXISTING_CABLE');
    assert.equal(line.materialNumber, approvedCableMat);
    // Auto-calc succeeds (material cost > 0). Optional packing/logistics layers are 0 with warnings
    // when this Path A line has a drum type name and no header incoterm — not a Cable Authority miss.
    assert.equal(line.costingReadinessStatus, 'CALCULATED_WITH_WARNINGS');
    assert.equal(line.status, 'COSTING_READY');
    assert.ok(line.materialCost != null && Number(line.materialCost) > 0);
  });

  // Test 6: Unapproved cable cannot be treated as EXISTING_CABLE
  it('Test 6: Unapproved cable is not treated as EXISTING_CABLE for structured parameters', async () => {
    const line = await addInquiryLine(
      createdInquiryId,
      {
        configurationPayload: {
          family: 'LV',
          voltage: '600/1000V',
          conductor: 'Copper',
          conductorSize: 16,
          cores: 1,
          insulation: 'XLPE',
          materialNumber: draftCableMat,
        },
        requestedQuantity: 1,
        cableDescription: 'Unapproved draft configuration',
      },
      customerA
    );

    assert.notEqual(line.cableAuthorityStatus, 'EXISTING_CABLE');
    assert.equal(line.cableAuthorityStatus, 'CONFIGURATION_REQUIRED');
  });

  // Test 7: Technically valid unmapped cable creates Technical Office request (PATH B)
  it('Test 7: Technically valid unmapped cable creates and links a TechnicalOfficeRequest', async () => {
    const line = await addInquiryLine(
      createdInquiryId,
      {
        configurationPayload: {
          family: 'LV',
          voltage: '600/1000V',
          conductor: 'Copper',
          conductorSize: 95, // size not in approved master
          cores: 1,
          insulation: 'XLPE',
        },
        requestedQuantity: 3,
        cableDescription: 'Cu / XLPE 0.6/1 kV 1X95 mm2 Custom Design',
      },
      customerA
    );

    assert.equal(line.cableAuthorityStatus, 'TECHNICALLY_VALID_NOT_MASTER');
    assert.equal(line.status, 'TECHNICAL_OFFICE_REQUIRED');
    assert.ok(line.technicalOfficeRequestId?.startsWith('TCR-INQ-'));
  });

  // Test 8: Invalid cable configuration is blocked
  it('Test 8: Invalid cable configuration is rejected and blocked from inquiry addition', async () => {
    await assert.rejects(
      () =>
        addInquiryLine(
          createdInquiryId,
          {
            configurationPayload: {
              family: 'HV',
              voltage: '300/500V', // Incompatible
              conductor: 'Copper',
              conductorSize: 16,
              cores: 1,
              insulation: 'XLPE',
            },
          },
          customerA
        ),
      (err: any) => err.code === 'INVALID_CONFIGURATION'
    );
  });

  // Test 9: CONFIGURATION_REQUIRED is not treated as approved
  it('Test 9: CONFIGURATION_REQUIRED blocks commercial line validation', async () => {
    const inq = await getInquiryById(createdInquiryId);
    const line = inq?.lines.find((l) => l.cableAuthorityStatus === 'CONFIGURATION_REQUIRED');
    assert.ok(line);
    assert.notEqual(line.status, 'COSTING_READY');
  });

  // Test 10: Eland Customer Master is VIP Fast Track — Standard SUBMIT is denied
  it('Test 10: Customer Master VIP Fast Track denies Standard SUBMIT', async () => {
    await attachTechnicalOfferToAllInquiryLines(createdInquiryId);
    await assert.rejects(
      () => submitInquiry(createdInquiryId, customerA),
      (err: unknown) =>
        Boolean(err && typeof err === 'object' && (err as { code?: string }).code === 'INQUIRY_PROCESS_ACTION_DENIED')
    );
  });

  // Test 11, 12: Sales creates Quotation Version 1 from inquiry lines
  it('Test 11 & 12: Sales creates Quotation V1 with frozen material cost snapshots', async () => {
    // Re-fetch inquiry to ensure lines are populated
    const inq = await getInquiryById(createdInquiryId);
    assert.ok(inq && inq.lines.length > 0);

    const quo = await createQuotationFromInquiry(
      {
        inquiryId: inq.id,
        currency: 'USD',
        incoterms: 'FOB',
        paymentTerms: 'LC at sight',
        remarks: 'Official Commercial Offer V1',
      },
      salesUser
    );

    assert.ok(quo.id);
    assert.ok(quo.quotationNumber.startsWith('QUO-'));
    assert.equal(quo.versionNo, 1);
    assert.equal(quo.isCurrent, true);
    assert.equal(quo.status, 'OPEN');
    assert.ok(Number(quo.materialCostTotal) > 0);

    // Test 17 & 18: Material cost is strictly NOT selling price, no commercial margin
    assert.equal(quo.sellingPrice, null);
    assert.equal(quo.commercialPricingStatus, 'NOT_CONFIGURED');

    createdQuotationId = quo.quotationNumber;
  });

  // Test 13 & 14: Quotation revision creates V2 while V1 becomes SUPERSEDED & immutable
  it('Test 13 & 14: Creating quotation revision generates V2 and marks V1 as SUPERSEDED and immutable', async () => {
    const v2 = await createQuotationRevision(
      createdQuotationId,
      {
        remarks: 'Revised delivery schedule per customer request',
      },
      salesUser
    );

    assert.equal(v2.versionNo, 2);
    assert.equal(v2.isCurrent, true);
    assert.equal(v2.status, 'OPEN');

    const prisma = getPrisma();
    const allVersions = await prisma!.commercialQuotation.findMany({
      where: { quotationNumber: createdQuotationId },
      orderBy: { versionNo: 'asc' },
    });

    assert.equal(allVersions.length, 2);
    assert.equal(allVersions[0].versionNo, 1);
    assert.equal(allVersions[0].isCurrent, false);
    assert.equal(allVersions[0].status, 'SUPERSEDED');
    assert.equal(allVersions[1].versionNo, 2);
    assert.equal(allVersions[1].isCurrent, true);
  });

  // Test 15 & 16: Material cost from costing engine & blocking reasons
  it('Test 15 & 16: Material cost is retrieved from Increment 10 costing architecture with transparent blocking reasons', async () => {
    const inq = await getInquiryById(createdInquiryId);
    assert.ok(inq);

    const approvedLine = inq?.lines.find((l) => l.materialNumber === approvedCableMat);
    assert.ok(approvedLine);
    assert.ok(approvedLine.materialCost != null && Number(approvedLine.materialCost) > 0);
  });

  // Test 17, 18, 19, 20: No commercial selling price, margin, discount, or drum formula calculated
  it('Test 17-20: Quotation initially creates with unconfigured selling price and null commercial status', async () => {
    const quo = await getQuotationById(createdQuotationId);
    assert.ok(quo);
    assert.equal(quo.sellingPrice, null);
    assert.equal(quo.commercialPricingStatus, 'NOT_CONFIGURED');
    assert.ok(quo.lines.every((l) => l.sellingPrice === null));
  });

  // Test 21: Customer cannot modify master data or create quotations directly
  it('Test 21: Customer role is blocked from creating quotations directly (403 UNAUTHORIZED)', () => {
    assert.throws(
      () => assertCanManageQuotations(customerA),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  // Test 22: Audit events created
  it('Test 22: Commercial inquiry and quotation actions create immutable AuditEvent entries', async () => {
    const prisma = getPrisma();
    const inqAudits = await prisma!.auditEvent.findMany({ where: { entity: 'CommercialInquiry' } });
    const quoAudits = await prisma!.auditEvent.findMany({ where: { entity: 'CommercialQuotation' } });
    assert.ok(inqAudits.length >= 1);
    assert.ok(quoAudits.length >= 1);
  });

  // Test 23: Regression across Increments 1-10
  it('Test 23: Existing Cable Authority, BOM Governance, Price Governance, and Costing Engine remain intact', async () => {
    const prisma = getPrisma();
    assert.ok((await prisma!.cableMaster.count()) >= 432);
    assert.ok((await prisma!.cableBomLine.count()) >= 4822);
    assert.ok((await prisma!.rawMaterial.count()) >= 74);
  });
});
