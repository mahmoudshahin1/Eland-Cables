import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import dotenv from 'dotenv';
import {
  BOM_CONFLICT_CLASSIFICATIONS,
  buildAttributesFromCable,
  mappingStatusFromAttributes,
  suggestEngineeringFromDescription,
} from '../services/engineeringMapping';
import { classifyBomConflict, listBomConflictRegister } from './governanceRepository';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { evaluatePersistedCable } from './masterDataRepository';
import { commitRawMaterials, memoryImportStores } from '../services/importPipelineService';

dotenv.config();

describe('Increment 5 engineering mapping (no silent approval)', () => {
  it('marks official diameter/weight as SOURCE and description tokens as Suggested only', () => {
    const attributes = buildAttributesFromCable({
      description: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 RMC IEC 60502-1',
      diameter: 10.9,
      weight: 268,
    });
    assert.equal(mappingStatusFromAttributes(attributes), 'PARTIAL');
    const dia = attributes.find((a) => a.field === 'diameter');
    const family = attributes.find((a) => a.field === 'family');
    const conductor = attributes.find((a) => a.field === 'conductor');
    assert.equal(dia?.origin, 'SOURCE');
    assert.equal(dia?.value, 10.9);
    assert.equal(family?.origin, 'MISSING');
    assert.equal(family?.value, null);
    assert.equal(conductor?.origin, 'DERIVED');
    assert.equal(conductor?.value, null);
    assert.equal(conductor?.suggestedValue, 'Copper');
    assert.equal(conductor?.suggestionLabel, 'Suggested');
  });

  it('does not treat a complete suggestion set as COMPLETE mapping', () => {
    const suggested = suggestEngineeringFromDescription('Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 IEC 60502-1');
    assert.ok(suggested.conductor);
    const attributes = buildAttributesFromCable({
      description: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 IEC 60502-1',
    });
    assert.notEqual(mappingStatusFromAttributes(attributes), 'COMPLETE');
  });
});

describe('Increment 5 PostgreSQL governance', () => {
  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    if (prisma) {
      await prisma.bomDuplicateObservation.deleteMany({ where: { conflictId: { startsWith: 'BOM-CONF-TEST' } } });
      await prisma.bomDuplicateObservation.deleteMany({ where: { conflictId: { startsWith: 'BOM-CONF-I10' } } });
    }
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.bomDuplicateObservation.deleteMany({ where: { conflictId: { startsWith: 'BOM-CONF-TEST' } } });
      await prisma.bomDuplicateObservation.deleteMany({ where: { conflictId: { startsWith: 'BOM-CONF-I10' } } });
    }
    await disconnectPrisma();
  });

  it('preserves all BOM conflict groups and does not overwrite weights on classification', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const before = await prisma.bomDuplicateObservation.findMany({ where: { conflictId: { startsWith: 'BOM-CONF-' } } });
    assert.equal(before.length, 81);
    const sample = before[0];
    const weightA = Number(sample.weightA);
    const weightB = Number(sample.weightB);
    const register = await listBomConflictRegister();
    const officialRegister = register.filter((r) => r.conflictId?.startsWith('BOM-CONF-'));
    assert.equal(officialRegister.length, 81);
    assert.ok(officialRegister.every((r) => Boolean(r.conflictId)));
    assert.ok(officialRegister.every((r) => Boolean(r.currentClassification)));
    const target = officialRegister.find((r) => r.conflictId);
    assert.ok(target?.conflictId);
    await classifyBomConflict(target!.conflictId!, {
      classification: 'BUSINESS_DECISION_REQUIRED',
      reviewer: 'increment5-test',
      comment: 'Insufficient evidence — not guessing.',
    });
    const after = await prisma.bomDuplicateObservation.findUnique({ where: { id: sample.id } });
    assert.equal(Number(after?.weightA), weightA);
    assert.equal(Number(after?.weightB), weightB);
    const bomCount = await prisma.cableBomLine.count();
    assert.ok(bomCount >= 4822);
  });

  it('rejects an unknown BOM classification and does not delete the group', async () => {
    const register = await listBomConflictRegister();
    const officialRegister = register.filter((r) => r.conflictId?.startsWith('BOM-CONF-'));
    const id = officialRegister[0].conflictId;
    assert.ok(id);
    await assert.rejects(
      () => classifyBomConflict(id!, { classification: 'AVERAGE_THE_WEIGHTS' }),
      (err: unknown) => (err as { code?: string }).code === 'INVALID_CLASSIFICATION'
    );
    assert.ok(BOM_CONFLICT_CLASSIFICATIONS.includes('BUSINESS_DECISION_REQUIRED'));
    const prisma = getPrisma();
    assert.equal(await prisma!.bomDuplicateObservation.count({ where: { conflictId: { startsWith: 'BOM-CONF-' } } }), 81);
  });

  it('does not match structured configurator fields against unmapped official cables', async () => {
    const decision = await evaluatePersistedCable({
      materialNumber: '10009487',
      family: 'LV',
      voltage: '600/1000V',
      conductor: 'Copper',
      conductorSize: 16,
      cores: 1,
      insulation: 'XLPE',
    });
    assert.equal(decision.code, 'CONFIGURATION_REQUIRED');
  });

  it('keeps blank RM prices as PRICE_NOT_CONFIGURED and never stores zero', async () => {
    const stores = memoryImportStores();
    const result = commitRawMaterials(
      [{ 'Raw Material Code': 'I5-RM-BLANK', Description: 'No price', 'Unit of Measurement': 'kg', Price: '' }],
      'rm.xlsx',
      'tester',
      { persist: true, stores }
    );
    assert.equal(result.rawMaterials?.[0].priceStatus, 'PRICE_NOT_CONFIGURED');
    assert.equal(result.rawMaterials?.[0].price, null);
    assert.notEqual(result.rawMaterials?.[0].price, 0);
  });

  it('reports material number unique and item/customer codes not unique', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const cables = await prisma.cableMaster.findMany({
      where: { NOT: { materialNumber: { startsWith: 'I4-' } } },
      select: { materialNumber: true, itemCode: true, customerCode: true },
    });
    const official = cables.filter((c) => /^\d+$/.test(c.materialNumber));
    const materials = new Set(official.map((c) => c.materialNumber));
    const items = new Set(official.map((c) => c.itemCode));
    const customers = new Set(official.map((c) => c.customerCode));
    assert.equal(materials.size, official.length);
    assert.ok(items.size < official.length);
    assert.ok(customers.size < official.length);
  });
});
