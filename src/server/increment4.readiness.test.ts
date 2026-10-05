import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import { inspectOfficialSourceAvailability } from '../services/officialSourceInspector';
import { findConflictingBomWeightGroups } from '../services/bomDuplicateForensics';
import { commitCables, commitRawMaterials, memoryImportStores, previewKind } from '../services/importPipelineService';
import { I4_FIXTURE_AUTHORITY, I4_FIXTURE_CABLE_ROW, I4_FIXTURE_EXISTING_MATERIAL } from '../fixtures/increment4/cableMasterFixtures';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import {
  appendRawMaterialPrice,
  createRawMaterial,
  evaluatePersistedCable,
  persistImportTransaction,
  searchCables,
  updateRawMaterial,
} from './masterDataRepository';
import { assertCanImportMasterData } from './rbac';
import { DomainError } from '../platform/errors/domainError';
import { signTestToken } from './auth';

dotenv.config();

const fixtureParameters = [
  { kind: 'FAMILY', code: 'LV', name: 'LV' },
  { kind: 'VOLTAGE', code: '600/1000V', name: '600/1000V' },
  { kind: 'CONDUCTOR', code: 'CU', name: 'Cu' },
  { kind: 'INSULATION', code: 'XLPE', name: 'XLPE' },
  { kind: 'SCREEN', code: 'NONE', name: 'None' },
  { kind: 'ARMOUR', code: 'NONE', name: 'None' },
  { kind: 'SHEATH', code: 'PVC', name: 'PVC' },
  { kind: 'CORE_COLOUR', code: 'BLK', name: 'Black' },
  { kind: 'STANDARD', code: 'IEC 60502-1', name: 'IEC 60502-1' },
];

describe('Increment 4 official source + BOM forensics', () => {
  it('reports official Cable List availability from data/source without modifying the file', () => {
    const status = inspectOfficialSourceAvailability();
    assert.equal(status.status, 'AVAILABLE');
    assert.equal(status.productionOnboarding, 'READY');
    assert.equal(status.files[0].found, true);
  });

  it('does not classify conflicting BOM weights as resolved', () => {
    const groups = findConflictingBomWeightGroups([
      { rowNumber: 10, cableMaterialNumber: '10009487', rawMaterial: 'CR01', weight: 135.23 },
      { rowNumber: 88, cableMaterialNumber: '10009487', rawMaterial: 'CR01', weight: 140 },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].weightA, 135.23);
    assert.equal(groups[0].weightB, 140);
    assert.equal(groups[0].occurrenceCount, 2);
    assert.equal(groups[0].classification, 'BUSINESS_DECISION_REQUIRED');
    assert.deepEqual(groups[0].sourceRowNumbers, [10, 88]);
  });
});

describe('Increment 4 Cable Master import pipeline', () => {
  it('detects duplicate material numbers and required-field errors', () => {
    const stores = memoryImportStores();
    const result = previewKind(
      'cables',
      [
        {
          'Specification Code': '',
          'Item Code': '',
          'Cable Material Number': 'I4-DUP',
          'Cable Desc': '',
          'Total Cable Weight': '',
          'Cable Diameter': '',
        },
        {
          'Specification Code': 'N2XH',
          'Item Code': 'X',
          'Cable Material Number': 'I4-DUP',
          'Cable Desc': 'desc',
          'Total Cable Weight': 1,
          'Cable Diameter': 1,
        },
      ],
      'fixture.xlsx',
      'tester',
      { stores }
    );
    assert.ok(result.batch.errors.some((e) => e.code === 'REQUIRED'));
    assert.ok(result.batch.errors.some((e) => e.code === 'DUPLICATE'));
    assert.ok(result.batch.status === 'PREVIEWED' || result.batch.status === 'REJECTED');
    assert.equal(stores.getCables().length, 0);
  });

  it('rejects an unknown family reference instead of inventing it', () => {
    const result = previewKind(
      'cables',
      [{ ...I4_FIXTURE_CABLE_ROW, 'Cable Family': 'NOT-A-FAMILY' }],
      'fixture.xlsx',
      'tester',
      { stores: memoryImportStores(), referenceParameters: fixtureParameters }
    );
    assert.ok(result.batch.errors.some((e) => e.code === 'INVALID_REFERENCE' && e.field === 'Cable Family'));
  });
});

describe('Increment 4 PostgreSQL readiness (fixture data only)', () => {
  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error || 'PostgreSQL required');
  });

  after(async () => {
    await disconnectPrisma();
  });

  it('imports the labeled fixture cable, searches it, and persists structured fields', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const stores = memoryImportStores();
    const imported = commitCables([I4_FIXTURE_CABLE_ROW], 'i4-fixture.xlsx', 'tester', {
      persist: true,
      stores,
      referenceParameters: fixtureParameters,
    });
    assert.equal(imported.batch.errorCount, 0, JSON.stringify(imported.batch.errors));
    await persistImportTransaction({
      kind: 'cables',
      batch: imported.batch,
      cables: imported.cables,
      actor: { id: 'u-admin-1', name: 'tester' },
    });
    const found = await searchCables({ q: I4_FIXTURE_EXISTING_MATERIAL });
    assert.ok(found.cables.some((c) => c.cableCode === I4_FIXTURE_EXISTING_MATERIAL));
    const row = await prisma.cableMaster.findUnique({ where: { materialNumber: I4_FIXTURE_EXISTING_MATERIAL } });
    assert.equal(row?.family, 'LV');
    assert.equal(row?.voltage, '600/1000V');
    assert.equal(row?.uom, 'M');
  });

  it('does not wipe family when Cable List reimport omits Family column', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const rowWithoutFamily = { ...I4_FIXTURE_CABLE_ROW } as Record<string, unknown>;
    delete rowWithoutFamily['Cable Family'];
    delete rowWithoutFamily.Voltage;
    const stores = memoryImportStores();
    const imported = commitCables([rowWithoutFamily], 'cable-list.xlsx', 'tester', {
      persist: true,
      stores,
    });
    assert.equal(imported.batch.errorCount, 0, JSON.stringify(imported.batch.errors));
    await persistImportTransaction({
      kind: 'cables',
      batch: imported.batch,
      cables: imported.cables,
      actor: { id: 'u-admin-1', name: 'tester' },
    });
    const row = await prisma.cableMaster.findUnique({ where: { materialNumber: I4_FIXTURE_EXISTING_MATERIAL } });
    assert.equal(row?.family, 'LV');
    assert.equal(row?.voltage, '600/1000V');
  });

  it('Test A: fixture approved cable is EXISTING_CABLE', async () => {
    const decision = await evaluatePersistedCable({
      ...I4_FIXTURE_AUTHORITY,
      customerCode: 'N2XH',
      materialNumber: I4_FIXTURE_EXISTING_MATERIAL,
    });
    assert.equal(decision.code, 'EXISTING_CABLE');
  });

  it('Test A-official: identity-only lookup of a Cable List material is EXISTING_CABLE', async () => {
    const decision = await evaluatePersistedCable({
      materialNumber: '10009487',
    });
    assert.equal(decision.code, 'EXISTING_CABLE');
    assert.equal(decision.cable?.materialNumber, '10009487');
  });

  it('Test B: one valid parameter change is TECHNICALLY_VALID_NOT_MASTER', async () => {
    const decision = await evaluatePersistedCable({
      ...I4_FIXTURE_AUTHORITY,
      cores: 4,
      customerCode: 'N2XH',
      materialNumber: I4_FIXTURE_EXISTING_MATERIAL,
    });
    assert.equal(decision.code, 'TECHNICALLY_VALID_NOT_MASTER');
  });

  it('Test C: invalid configuration is INVALID_CONFIGURATION', async () => {
    const decision = await evaluatePersistedCable({
      ...I4_FIXTURE_AUTHORITY,
      family: 'HV',
      voltage: '300/500V',
    });
    assert.equal(decision.code, 'INVALID_CONFIGURATION');
  });

  it('Test D: missing FAMILY/CORE_COLOUR rule is CONFIGURATION_REQUIRED', async () => {
    const decision = await evaluatePersistedCable({
      ...I4_FIXTURE_AUTHORITY,
      coreColour: 'RED',
    });
    assert.equal(decision.code, 'CONFIGURATION_REQUIRED');
  });

  it('raw material CRUD, duplicate detection, blank price, and history without invented dates', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const code = `I4-RM-${Date.now()}`;
    const created = await createRawMaterial(
      { code, description: 'Fixture copper rod', uom: 'kg', category: 'Conductor', supplier: 'Fixture' },
      { name: 'tester' }
    );
    assert.equal(created.priceStatus, 'PRICE_NOT_CONFIGURED');
    assert.equal(created.price, null);
    await assert.rejects(
      () => createRawMaterial({ code, description: 'dup', uom: 'kg' }, { name: 'tester' }),
      (err: unknown) => (err as { code?: string }).code === 'DUPLICATE_RAW_MATERIAL'
    );
    const updated = await updateRawMaterial(code, { description: 'Fixture copper rod updated' }, { name: 'tester' });
    assert.equal(updated?.description, 'Fixture copper rod updated');

    const first = await appendRawMaterialPrice(code, { price: 12.5, currency: 'USD' }, { name: 'tester' });
    assert.ok(first && 'temporalStatus' in first);
    assert.equal((first as { temporalStatus: string }).temporalStatus, 'DATA_REQUIRED');
    assert.equal((first as { effectiveFrom: Date | null }).effectiveFrom, null);

    const second = await appendRawMaterialPrice(
      code,
      { price: 13.1, currency: 'USD', effectiveFrom: '2026-01-01' },
      { name: 'tester' }
    );
    assert.equal((second as { temporalStatus: string }).temporalStatus, 'EFFECTIVE');
    const history = await prisma.rawMaterialPrice.findMany({ where: { rawMaterialCode: code }, orderBy: { createdAt: 'asc' } });
    assert.equal(history.length, 2);
    assert.equal(Number(history[0].price), 12.5);
    assert.equal(history[0].effectiveFrom, null);

    const blankImport = commitRawMaterials(
      [{ 'Raw Material Code': `${code}-BLANK`, Description: 'No price', 'Unit of Measurement': 'kg', Price: '' }],
      'rm-fixture.xlsx',
      'tester',
      { persist: true, stores: memoryImportStores() }
    );
    await persistImportTransaction({
      kind: 'raw_materials',
      batch: blankImport.batch,
      rawMaterials: blankImport.rawMaterials,
      actor: { name: 'tester' },
    });
    const blankPrices = await prisma.rawMaterialPrice.findMany({ where: { rawMaterialCode: `${code}-BLANK` } });
    assert.equal(blankPrices.length, 0);
  });

  it('official Cable List is persisted (432) without fabricating rows', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const official = await prisma.cableMaster.count({
      where: { materialNumber: { not: { startsWith: 'I4-' } } },
    });
    assert.ok(official >= 432, `expected official Cable List import, got ${official}`);
    const rm = await prisma.rawMaterial.count();
    assert.ok(rm >= 74);
    const blank = await prisma.rawMaterial.count({ where: { priceStatus: 'PRICE_NOT_CONFIGURED' } });
    assert.ok(blank >= 74);
    const priceZero = await prisma.rawMaterialPrice.count({ where: { price: 0 } });
    assert.equal(priceZero, 0);
    // Scope to the 81 official Cable List conflicts. Official observations carry a
    // numeric conflictId (`BOM-CONF-001`..`BOM-CONF-081`, governanceRepository.ts),
    // matching the `official` filter used by bomConflictCounts() and increment5.governance.test.
    // Other suites (increment8/9/10) inject transient rows with non-numeric conflictIds
    // (`BOM-CONF-TEST-999`, `BOM-CONF-I10-*`, `BOM-CONF-I9-*`) into the shared DB, and the
    // import may leave fixture rows without a conflictId; an unscoped count() is therefore
    // order-dependent and non-deterministic across the shared Postgres DB. Excluding those
    // test prefixes asserts the real import produced exactly the 81 official observations,
    // independent of cross-suite state, without weakening the count.
    const obs = await prisma.bomDuplicateObservation.count({
      where: {
        conflictId: { startsWith: 'BOM-CONF-' },
        NOT: [
          { conflictId: { startsWith: 'BOM-CONF-TEST' } },
          { conflictId: { startsWith: 'BOM-CONF-I10' } },
          { conflictId: { startsWith: 'BOM-CONF-I9' } },
        ],
      },
    });
    assert.equal(obs, 81);
    const bom = await prisma.cableBomLine.count();
    assert.ok(bom >= 4822);
  });

  it('BOM lines require Cable Master and Raw Material FKs', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const officialBefore = await prisma.cableBomLine.count({ where: { cableMaterialNumber: '10009492' } });
    const stores = memoryImportStores();
    const imported = commitCables([I4_FIXTURE_CABLE_ROW], 'i4-fixture-bom.xlsx', 'tester', {
      persist: true,
      stores,
      referenceParameters: fixtureParameters,
    });
    assert.equal(imported.batch.errorCount, 0, JSON.stringify(imported.batch.errors));
    await persistImportTransaction({
      kind: 'cables',
      batch: imported.batch,
      cables: imported.cables,
      actor: { id: 'u-admin-1', name: 'tester' },
    });
    const owned = await prisma.cableMaster.findUnique({
      where: { materialNumber: I4_FIXTURE_EXISTING_MATERIAL },
    });
    assert.equal(owned?.materialNumber, I4_FIXTURE_EXISTING_MATERIAL);
    assert.notEqual(owned?.materialNumber, '10009492');

    const rmCode = `I4-RM-BOM-${Date.now()}`;
    try {
      await prisma.rawMaterial.create({
        data: { code: rmCode, description: 'fixture rm', uom: 'kg', priceStatus: 'PRICE_NOT_CONFIGURED' },
      });
      await assert.rejects(() =>
        prisma.cableBomLine.create({
          data: {
            cableMaterialNumber: 'I4-DOES-NOT-EXIST',
            rawMaterialCode: rmCode,
            consumption: 1,
            uom: 'kg',
          },
        })
      );
      await prisma.cableBomLine.create({
        data: {
          cableMaterialNumber: I4_FIXTURE_EXISTING_MATERIAL,
          rawMaterialCode: rmCode,
          consumption: 1.5,
          uom: 'kg',
          bomVersion: 1,
        },
      });
      const linked = await prisma.cableBomLine.findFirst({
        where: { cableMaterialNumber: I4_FIXTURE_EXISTING_MATERIAL, rawMaterialCode: rmCode },
      });
      assert.equal(Number(linked?.consumption), 1.5);
      assert.equal(await prisma.cableBomLine.count({ where: { cableMaterialNumber: '10009492' } }), officialBefore);
    } finally {
      await prisma.cableBomLine.deleteMany({
        where: { cableMaterialNumber: I4_FIXTURE_EXISTING_MATERIAL, rawMaterialCode: rmCode },
      });
      await prisma.rawMaterial.deleteMany({ where: { code: rmCode } });
    }
  });
});

describe('Increment 4 RBAC', () => {
  it('customers cannot import master data', () => {
    assert.throws(
      () =>
        assertCanImportMasterData({
          id: 'u-eland',
          userType: 'customer',
          email: 'david.smith@elandcables.com',
          permissions: { masterData: false },
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
    const token = signTestToken({
      id: 'u-eland',
      userType: 'customer',
      email: 'david.smith@elandcables.com',
      permissions: { masterData: false },
    });
    assert.ok(token.length > 10);
  });
});
