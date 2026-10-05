import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import {
  allCutoverGatesPassed,
  canPromoteToPostgresqlSot,
  cutoverMatrixForEntity,
  MASTER_DATA_CUTOVER_FRAMEWORK,
  preferPostgresMasterData,
  sotStatusForEntity,
} from './masterDataSoT';
import { resolveMasterListPreferringPostgres } from '../services/masterDataApiService';
import {
  BOM_LOCAL_IS_AUTHORITATIVE,
  BOM_LS_CLASS,
  BOM_STORAGE_KEY,
  saveCableBoms,
} from '../services/cableBomService';
import { checkDatabase, disconnectPrisma, getPrisma } from '../server/db';
import { listBoms, persistCableBomExcelCommit } from '../server/masterDataRepository';

dotenv.config();

describe('Task 04B-9 Cable BOM persistence remediation', () => {
  it('CableBomLine remains POSTGRESQL_PRIMARY — not promoted', () => {
    const bom = sotStatusForEntity('CableBomLine');
    assert.ok(bom);
    assert.equal(bom.status, 'POSTGRESQL_PRIMARY');
    assert.equal(bom.postgresSoT, false);
    assert.equal(bom.cutoverPhase, 'LS_NON_AUTHORITATIVE');
    assert.notEqual(bom.cutoverPhase, 'CUTOVER_READY');
    assert.equal(canPromoteToPostgresqlSot(bom), false);
  });

  it('Gate C remediated — Excel Method-B no longer LS-only authoritative write', () => {
    const bom = sotStatusForEntity('CableBomLine');
    assert.ok(bom);
    assert.equal(bom.gates?.C, true);
    assert.equal(bom.gates?.I, true);
    assert.equal(allCutoverGatesPassed(bom.gates), true);
    assert.equal(canPromoteToPostgresqlSot(bom), false, 'cutoverPhase blocks promotion');
  });

  it('cutover matrix still not ready — governance debt blocks promotion', () => {
    const row = cutoverMatrixForEntity('CableBomLine');
    assert.ok(row);
    assert.equal(row.cutoverReady, false);
    assert.equal(row.currentSoTStatus, 'POSTGRESQL_PRIMARY');
    assert.equal(row.lsWritePathsRemaining, false);
    assert.match(String(row.blockingReason || ''), /81|governance|BomDuplicateObservation/i);
  });

  it('ExcelMethodBCableBomUpload remediated to PG write path', () => {
    const excel = sotStatusForEntity('ExcelMethodBCableBomUpload');
    assert.ok(excel);
    assert.equal(excel.status, 'POSTGRESQL_PRIMARY');
    assert.equal(excel.localStorageAuthority, false);
    assert.equal(excel.gates?.C, true);
    assert.equal(excel.gates?.I, true);
  });

  it('refuses LS-only saveCableBoms writes (mirrorAfterPgSuccess required)', () => {
    assert.equal(BOM_LOCAL_IS_AUTHORITATIVE, false);
    assert.equal(BOM_LS_CLASS, 'NON_AUTHORITATIVE_MIRROR');
    assert.equal(BOM_STORAGE_KEY, 'energya_cable_boms_v3');
    assert.throws(
      () =>
        saveCableBoms([
          {
            id: 'x',
            customerCode: 'N2XH',
            cableMaterialNumber: '10009487',
            rawMaterial: 'CR01',
            rawMaterialName: 'Copper',
            weight: 1,
            unitKm: 'kg',
          },
        ]),
      /NON_AUTHORITATIVE_MIRROR|PostgreSQL/
    );
  });

  it('stale LS cannot override PG; PG failure is non-authoritative', () => {
    const pg = [{ id: 'pg', cableMaterialNumber: '10009487', rawMaterial: 'CR01', weight: 1, unitKm: 'kg' }];
    const ls = [{ id: 'ls', cableMaterialNumber: '10009487', rawMaterial: 'CR01', weight: 999, unitKm: 'kg' }];
    const resolved = preferPostgresMasterData({ ok: true, data: pg }, ls);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.equal(resolved.data[0].weight, 1);

    const fallback = resolveMasterListPreferringPostgres({ ok: false, error: '503' }, ls);
    assert.equal(fallback.authoritative, false);
    assert.equal(fallback.source, 'LOCALSTORAGE_FALLBACK');
  });

  it('does not falsely promote sibling entities', () => {
    for (const entity of ['CableParameter']) {
      assert.equal(sotStatusForEntity(entity)?.status, 'POSTGRESQL_PRIMARY', entity);
      assert.equal(cutoverMatrixForEntity(entity)?.cutoverReady, false, entity);
    }
    assert.equal(sotStatusForEntity('CableMaster')?.status, 'POSTGRESQL_SOT');
    assert.equal(sotStatusForEntity('DrumMaster')?.status, 'POSTGRESQL_SOT');
  });

  it('framework next cutover entity remains CableBomLine', () => {
    assert.equal(MASTER_DATA_CUTOVER_FRAMEWORK.nextEntityCutover, 'CableBomLine');
  });

  it('governance debt documented — BomDuplicateObservation not auto-resolved', () => {
    const row = cutoverMatrixForEntity('CableBomLine');
    assert.ok(row);
    assert.match(String(row.blockingReason || ''), /81|governance|BomDuplicateObservation/i);
    assert.match(String(row.gate04B || ''), /governance|STOP/i);
  });

  it('DRAFT/UNAPPROVED governed BOM must not be treated as POSTGRESQL_SOT', () => {
    const bom = sotStatusForEntity('CableBomLine');
    assert.equal(bom?.postgresSoT, false);
    assert.equal(bom?.status, 'POSTGRESQL_PRIMARY');
  });
});

describe('Task 04B-9 Cable BOM PG write + audit evidence', () => {
  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error || 'PostgreSQL required');
  });

  after(async () => {
    await disconnectPrisma();
  });

  it('persistCableBomExcelCommit validates CableMaster + RawMaterial FKs', async () => {
    await assert.rejects(
      () =>
        persistCableBomExcelCommit({
          lines: [
            {
              id: 'bad',
              customerCode: 'N2XH',
              cableMaterialNumber: 'NONEXISTENT-CABLE-04B9',
              rawMaterial: 'CR01',
              rawMaterialName: 'Copper',
              weight: 1,
              unitKm: 'kg',
            },
          ],
          replaceCableMaterialNumbers: ['NONEXISTENT-CABLE-04B9'],
          actor: { id: 'test-04b9', name: '04b9-test' },
        }),
      /not in Cable Master|VALIDATION/i
    );
  });

  it('persistCableBomExcelCommit writes whole-txn AuditEvent (entity CableBom)', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const marker = `04B9-${Date.now()}`;
    const materialNumber = `04B9-CABLE-${marker}`;
    const keepRm = `04B9-RM-KEEP-${marker}`;
    const oldRm = `04B9-RM-OLD-${marker}`;
    const nextRm = `04B9-RM-NEXT-${marker}`;
    assert.notEqual(materialNumber, '10009492');
    assert.match(materialNumber, /^04B9-CABLE-/);

    const officialBefore = await prisma.cableBomLine.count({ where: { cableMaterialNumber: '10009492' } });
    let batchRef = '';
    try {
      await prisma.cableMaster.create({
        data: {
          materialNumber,
          itemCode: materialNumber,
          customerCode: '04B9-TEST',
          description: '04B9 isolation cable',
          diameter: 1,
          weight: 1,
          sourceBatch: marker,
        },
      });
      await prisma.rawMaterial.createMany({
        data: [keepRm, oldRm, nextRm].map((code) => ({
          code,
          description: '04B9 isolation raw material',
          uom: 'kg',
          sourceBatch: marker,
        })),
      });
      await prisma.cableBomLine.createMany({
        data: [
          { cableMaterialNumber: materialNumber, rawMaterialCode: keepRm, consumption: 3, uom: 'kg', bomVersion: 1, sourceBatch: marker },
          { cableMaterialNumber: materialNumber, rawMaterialCode: oldRm, consumption: 4, uom: 'kg', bomVersion: 1, sourceBatch: marker },
        ],
      });

      const owned = await prisma.cableMaster.findUnique({ where: { materialNumber } });
      assert.equal(owned?.sourceBatch, marker);
      assert.equal(owned?.customerCode, '04B9-TEST');
      assert.notEqual(owned?.materialNumber, '10009492');

      const result = await persistCableBomExcelCommit({
        lines: [
          {
            id: 'line-1',
            customerCode: '04B9-TEST',
            cableMaterialNumber: materialNumber,
            rawMaterial: nextRm,
            rawMaterialName: nextRm,
            weight: 0.25,
            unitKm: 'kg',
          },
        ],
        replaceCableMaterialNumbers: [materialNumber],
        sourceFile: '04b9-test.xlsx',
        actor: { id: 'test-04b9', name: '04b9-test' },
      });
      batchRef = result.batchRef;

      assert.ok(result.batchRef.startsWith('EXCEL-BOM-'));
      assert.equal(result.upserted, 1);
      const audit = await prisma.auditEvent.findFirst({
        where: { entity: 'CableBom', entityId: result.batchRef, action: 'BOM_CHANGE' },
        orderBy: { at: 'desc' },
      });
      assert.ok(audit);
      assert.match(String(audit.message || ''), /Excel Method-B/i);

      const remaining = await prisma.cableBomLine.findMany({ where: { cableMaterialNumber: materialNumber } });
      assert.deepEqual(
        remaining.map((line) => line.rawMaterialCode),
        [nextRm]
      );
      assert.equal(Number(remaining[0]?.consumption), 0.25);
      assert.equal(await prisma.cableBomLine.count({ where: { cableMaterialNumber: '10009492' } }), officialBefore);
    } finally {
      if (batchRef) {
        await prisma.auditEvent.deleteMany({ where: { entityId: batchRef } });
      }
      await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: materialNumber } });
      await prisma.rawMaterial.deleteMany({ where: { code: { in: [keepRm, oldRm, nextRm] } } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber, sourceBatch: marker } });
    }
  });

  it('listBoms returns PG-backed rows after excel commit', async () => {
    const boms = await listBoms();
    assert.ok(Array.isArray(boms));
  });

  it('81+ BomDuplicateObservation governance register preserved (not deleted)', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const count = await prisma.bomDuplicateObservation.count({
      where: { conflictId: { startsWith: 'BOM-CONF-' } },
    });
    assert.ok(count >= 81, `expected governance debt register >= 81, got ${count}`);
  });

  it('promotion still blocked after gate remediation', () => {
    const bom = sotStatusForEntity('CableBomLine');
    assert.ok(bom);
    assert.equal(allCutoverGatesPassed(bom.gates), true);
    assert.equal(bom.cutoverPhase, 'LS_NON_AUTHORITATIVE');
    assert.equal(canPromoteToPostgresqlSot(bom), false);
  });
});
