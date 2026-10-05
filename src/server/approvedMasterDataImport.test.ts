import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { stampOfficialImportedMasterValidation, evaluateCableCostingReadiness } from './governanceRepository';
import { evaluatePersistedCable, persistImportTransaction } from './masterDataRepository';
import { loadImportedCableCalculationEvidence } from './importedCableCalculationEvidence';
import { importedCableSatisfiesCalculationEngineering } from '../domain/importedCableCalculationAuthority';
import { commitCables, memoryImportStores } from '../services/importPipelineService';

dotenv.config();

describe('Approved Cable Master import validation stamp', () => {
  const actor = { id: 'u-md-import', name: 'Master Data Import', email: 'md@import.test' };

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
  });

  after(async () => {
    await disconnectPrisma();
  });

  it('1-5 imported official cable+BOM+lines are VALIDATED and can calculate without V2 snapshot', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const stamp = await stampOfficialImportedMasterValidation({
      materialNumbers: ['10009487', '10009492'],
      actor,
      sourceFile: 'Energya Cable Master Data.xlsx / Cable List',
      batchNumber: 'TEST-OFFICIAL-STAMP',
    });
    assert.ok(stamp.stamped >= 1);

    const cable = await prisma.cableMaster.findUnique({ where: { materialNumber: '10009487' } });
    assert.equal(cable?.approvalStatus, 'APPROVED');
    const mapping = await prisma.cableEngineeringMapping.findFirst({
      where: { materialNumber: '10009487', isCurrent: true },
    });
    assert.equal(mapping?.status, 'APPROVED');
    const bomCount = await prisma.cableBomLine.count({
      where: { cableMaterialNumber: '10009487', status: 'ACTIVE' },
    });
    assert.ok(bomCount > 0);
    const evidence = await loadImportedCableCalculationEvidence('10009487');
    assert.equal(importedCableSatisfiesCalculationEngineering(evidence), true);

    const authority = await evaluatePersistedCable({ materialNumber: '10009487' });
    assert.equal(authority.code, 'EXISTING_CABLE');
    const readiness = await evaluateCableCostingReadiness('10009487');
    assert.equal(readiness[0]?.engineeringStatus, 'APPROVED');
    assert.equal(readiness[0]?.bomStatus, 'RESOLVED');

    const snapshots = await prisma.v2ConfigurationSnapshot.count({
      where: { cableMaterialNumber: '10009487', snapshotId: { contains: 'TEST-OFFICIAL-STAMP' } },
    });
    assert.equal(snapshots, 0);
  });

  it('6 incomplete fixture import is not falsely validated', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const stores = memoryImportStores();
    const imported = commitCables(
      [
        {
          'Item Code': 'I-STAMP-ITEM',
          'Specification Code': 'N2XH',
          'Cable Material Number': 'I-STAMP-NOT-OFFICIAL',
          'Cable Desc': 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2',
          'Total Cable Weight': 268,
          'Cable Diameter': 10.9,
        },
      ],
      'i4-fixture.xlsx',
      'tester',
      { persist: true, stores }
    );
    assert.equal(imported.batch.errorCount, 0, JSON.stringify(imported.batch.errors));
    await persistImportTransaction({
      kind: 'cables',
      batch: imported.batch,
      cables: imported.cables,
      actor,
    });
    const mapping = await prisma.cableEngineeringMapping.findFirst({
      where: { materialNumber: 'I-STAMP-NOT-OFFICIAL', isCurrent: true },
    });
    assert.ok(!mapping || mapping.status !== 'APPROVED');
    const evidence = await loadImportedCableCalculationEvidence('I-STAMP-NOT-OFFICIAL');
    assert.equal(importedCableSatisfiesCalculationEngineering(evidence), false);
    await prisma.cableMaster.deleteMany({ where: { materialNumber: 'I-STAMP-NOT-OFFICIAL' } });
  });

  it('7 audit records approved MD import provenance', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const audit = await prisma.auditEvent.findFirst({
      where: {
        entity: 'CableMaster',
        action: 'IMPORT',
        message: { contains: 'Approved Cable Master import stamped' },
      },
      orderBy: { at: 'desc' },
    });
    assert.ok(audit);
    const value = audit.newValue as { validationOrigin?: string };
    assert.equal(value.validationOrigin, 'APPROVED_CABLE_MASTER_IMPORT');
  });
});
