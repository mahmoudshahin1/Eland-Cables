import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { createCable, getCable, listDrums, listRawMaterials, persistImportTransaction } from './masterDataRepository';
import { updateDrumStatus } from './drumMasterWriteRepository';
import { commitRawMaterials, memoryImportStores } from '../services/importPipelineService';
import { preferPostgresMasterData } from '../platform/masterDataSoT';

dotenv.config();

describe('Increment 2 PostgreSQL master data', () => {
  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error || 'PostgreSQL must be reachable for Increment 2');
  });

  after(async () => {
    await disconnectPrisma();
  });

  it('reports database connectivity', async () => {
    const health = await checkDatabase();
    assert.equal(health.postgresql, true);
    assert.equal(health.prisma, true);
  });

  it('creates and reads a cable without inventing a sales price', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const materialNumber = `TEST-${Date.now()}`;
    const created = await createCable(
      {
        id: `mc-${materialNumber}`,
        itemCode: 'TESTITEM',
        cableCode: materialNumber,
        customerCode: 'N2XH',
        code: `N2XH ${materialNumber}`,
        description: 'Test cable Increment 2',
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
      { id: 'test', name: 'increment2' }
    );
    assert.equal(created.cableCode, materialNumber);
    assert.equal(created.priceConfigured, false);
    const fetched = await getCable(materialNumber);
    assert.equal(fetched?.description, 'Test cable Increment 2');
    await prisma.cableMaster.delete({ where: { materialNumber } });
  });

  it('persists raw materials with PRICE_NOT_CONFIGURED and no zero price row', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const code = `RMTEST${Date.now()}`;
    const stores = memoryImportStores();
    const result = commitRawMaterials(
      [{ 'Raw Material Code': code, Description: 'Test RM', 'Unit of Measurement': 'kg', Price: '' }],
      'test.xlsx',
      'tester',
      { persist: true, stores }
    );
    await persistImportTransaction({
      kind: 'raw_materials',
      batch: result.batch,
      rawMaterials: result.rawMaterials,
      actor: { name: 'tester' },
    });
    const listed = await listRawMaterials();
    const row = listed.find((r) => r.rawMaterialCode === code);
    assert.ok(row);
    assert.equal(row.price, null);
    assert.equal(row.priceStatus, 'PRICE_NOT_CONFIGURED');
    const prices = await prisma.rawMaterialPrice.findMany({ where: { rawMaterialCode: code } });
    assert.equal(prices.length, 0);
    await prisma.rawMaterial.delete({ where: { code } });
    await prisma.importBatch.deleteMany({ where: { batchNumber: result.batch.batchNumber } });
    await prisma.auditEvent.deleteMany({ where: { entityId: result.batch.batchNumber } });
  });

  it('Task 04: PostgreSQL cable wins over stale local payload', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const materialNumber = `T04-${Date.now()}`;
    await createCable(
      {
        id: `mc-${materialNumber}`,
        itemCode: 'T04ITEM',
        cableCode: materialNumber,
        customerCode: 'N2XH',
        code: `N2XH ${materialNumber}`,
        description: 'Task 04 SoT cable',
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
      { id: 'task04', name: 'task04' }
    );
    const fetched = await getCable(materialNumber);
    const prefer = preferPostgresMasterData(
      { ok: true, data: fetched },
      { ...fetched!, description: 'stale localStorage' }
    );
    assert.equal(prefer.data?.description, 'Task 04 SoT cable');
    assert.equal(prefer.staleLocalIgnored, true);
    await prisma.cableMaster.delete({ where: { materialNumber } });
  });

  it('Task 04: drum status update is PostgreSQL + AuditEvent', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const drumCode = `T04D-${Date.now()}`;
    await prisma.drumMaster.create({
      data: {
        drumCode,
        flange: 630,
        barrel: 300,
        innerWidth: 600,
        outerWidth: 760,
        capacity: 650,
        status: 'ACTIVE',
      },
    });
    const updated = await updateDrumStatus(drumCode, 'INACTIVE', { id: 'task04', name: 'task04' });
    assert.equal(updated?.status, 'INACTIVE');
    assert.equal((await listDrums()).find((d) => d.drumCode === drumCode)?.status, 'INACTIVE');
    const audit = await prisma.auditEvent.findFirst({
      where: { entity: 'DrumMaster', entityId: drumCode, action: 'DEACTIVATE' },
      orderBy: { at: 'desc' },
    });
    assert.ok(audit);
    await prisma.drumMaster.delete({ where: { drumCode } });
    await prisma.auditEvent.deleteMany({ where: { entityId: drumCode } });
  });
});
