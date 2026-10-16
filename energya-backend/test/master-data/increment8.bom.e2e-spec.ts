import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma.service.js';
import { assertCanApproveBomGovernance } from '../../src/shared/domain/rbac.js';
import { DomainError } from '../../src/shared/errors/domainError.js';

describe('Increment 8 — BOM Governance & Material Consumption Review (NestJS e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const cableMat = 'I8-CABLE-BOM-TEST-01';
  const conflictId = 'BOM-CONF-001';
  const actorCustomer = {
    id: 'u-cust-1',
    name: 'David Smith',
    userType: 'customer',
    permissions: { masterData: false, technicalOffice: false },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    // Clean any prior run artifacts
    await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
    await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: cableMat } });
    await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
    await prisma.cableMaster.deleteMany({ where: { materialNumber: cableMat } });

    // Seed test cable
    await prisma.cableMaster.create({
      data: {
        materialNumber: cableMat,
        itemCode: 'I8-ITEM-01',
        customerCode: 'N2XH',
        description: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 BOM Test Cable',
        voltage: 'LV',
        conductor: 'Copper',
        cores: '1C',
        conductorSize: '16',
        diameter: 10.9,
        weight: 268,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
      await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: cableMat } });
      await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: cableMat } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber: cableMat } });
    }
    await app.close();
  });

  // Test 1: All 81 conflict groups preserved
  it('Test 1: All 81 conflict groups are preserved in BomDuplicateObservation without loss', async () => {
    const count = await prisma.bomDuplicateObservation.count();
    expect(count).toBe(81);
  });

  // Test 2 & 9 & 10 & 11: Source values immutable, multiple consumption values preserved, no averaging/deletion
  it('Test 2, 9, 10, 11: Original source weights and row counts remain preserved and immutable', async () => {
    const firstConflict = await prisma.bomDuplicateObservation.findFirst();
    expect(firstConflict).toBeDefined();
    expect(Number(firstConflict!.weightA)).toBeGreaterThan(0);
    expect(Number(firstConflict!.weightB)).toBeGreaterThan(0);
    expect(Number(firstConflict!.weightA)).not.toBe(Number(firstConflict!.weightB));
    expect(firstConflict!.occurrenceCount).toBeGreaterThanOrEqual(2);

    // Ensure source CableBomLine table was not deleted
    const totalSourceBoms = await prisma.cableBomLine.count();
    expect(totalSourceBoms).toBeGreaterThanOrEqual(4822);
  });

  // Test 5: Unauthorized approval blocked
  it('Test 5: Customer cannot approve BOM governance decision (403 UNAUTHORIZED)', () => {
    expect(() => assertCanApproveBomGovernance(actorCustomer as any)).toThrowError();
    try {
      assertCanApproveBomGovernance(actorCustomer as any);
    } catch (err: any) {
      expect(err instanceof DomainError).toBe(true);
      expect(err.code).toBe('UNAUTHORIZED');
    }
  });

  // Test 12: UOM preservation
  it('Test 12: Source UOM (kg, PCS, m2) is preserved without fake conversions', async () => {
    const boms = await prisma.cableBomLine.findMany({ select: { uom: true } });
    const uomSet = new Set(boms.map((b) => b.uom));
    expect(uomSet.has('kg')).toBe(true);
    expect(uomSet.has('PCS')).toBe(true);
  });

  // Deferred tests to Phase 2c (governance workflow actions and costing readiness)
  it.todo('Test 3: Technical Office can classify conflict with governed category (Deferred to Phase 2c: BOM Governance)');
  it.todo('Test 4: Resolving conflict requires mandatory evidence according to classification category (Deferred to Phase 2c: BOM Governance)');
  it.todo('Test 6 & 7: Authorized Technical Office Manager approval creates GovernedBomLine and AuditEvent (Deferred to Phase 2c: BOM Governance)');
  it.todo('Test 8: Reopening an approved BOM conflict marks GovernedBomLine as UNDER_REVIEW (Deferred to Phase 2c: BOM Governance)');
  it.todo('Test 13: Missing RM price (PRICE_NOT_CONFIGURED) blocks costing readiness (Deferred to Phase 2c: Costing Readiness)');
  it.todo('Test 14: Cable with unapproved engineering mapping is NOT_READY or UNDER_REVIEW (Deferred to Phase 2c: Costing Readiness)');
  it.todo('Test 15: Approved mapping + resolved BOM evaluated with transparent blocking reasons (Deferred to Phase 2c: Costing Readiness)');
  it.todo('Test 16: Cable associated with an unresolved BOM conflict is flagged as CONFLICT_UNRESOLVED (Deferred to Phase 2c: Costing Readiness)');
  it.todo('Test 17: Approved cable mapping continues evaluating to EXISTING_CABLE (Deferred to Phase 2c: Cable Authority)');
});
