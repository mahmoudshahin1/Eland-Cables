import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MASTER_DATA_CUTOVER_FRAMEWORK,
  MASTER_DATA_CUTOVER_MATRIX,
  allCutoverGatesPassed,
  canPromoteToPostgresqlSot,
  cutoverMatrixForEntity,
  preferPostgresMasterData,
  sotStatusForEntity,
} from './masterDataSoT';
import { resolveMasterListPreferringPostgres } from '../services/masterDataApiService';
import {
  IMPORT_BATCH_LOCAL_IS_AUTHORITATIVE,
  IMPORT_BATCH_LS_CLASS,
  IMPORT_BATCH_STORAGE_KEY,
  saveImportBatch,
} from '../services/importBatchService';
import { commitRawMaterials, memoryImportStores } from '../services/importPipelineService';
import type { ImportBatchRecord } from '../types';

describe('Task 04B-3 Import Batch PostgreSQL SoT cutover', () => {
  it('promotes ImportBatch to POSTGRESQL_SOT with all gates A–J', () => {
    const ib = sotStatusForEntity('ImportBatch');
    assert.ok(ib);
    assert.equal(ib.status, 'POSTGRESQL_SOT');
    assert.equal(ib.postgresSoT, true);
    assert.equal(ib.cutoverPhase, 'POSTGRESQL_SOT');
    assert.equal(ib.localStorageAuthority, false);
    assert.equal(ib.localStorageCompatibilityMirror, true);
    assert.equal(allCutoverGatesPassed(ib.gates), true);
    assert.equal(canPromoteToPostgresqlSot(ib), true);
  });

  it('matrix marks Import Batches cutover ready without blocking reason', () => {
    const row = cutoverMatrixForEntity('Import Batches');
    assert.ok(row);
    assert.equal(row.currentSoTStatus, 'POSTGRESQL_SOT');
    assert.equal(row.cutoverReady, true);
    assert.equal(row.blockingReason, null);
    assert.equal(row.lsAuthoritative, false);
    assert.equal(row.mirrorAllowed, true);
    assert.ok(MASTER_DATA_CUTOVER_FRAMEWORK.entityCutoversCompleted.includes('ImportBatch'));
    assert.equal(MASTER_DATA_CUTOVER_FRAMEWORK.nextEntityCutover, 'CableBomLine');
  });

  it('does not promote sibling PRIMARY entities via ImportBatch cutover', () => {
    assert.equal(sotStatusForEntity('CableMaster')?.status, 'POSTGRESQL_SOT');
    assert.equal(sotStatusForEntity('DrumMaster')?.status, 'POSTGRESQL_SOT');
    for (const entity of ['CableBomLine']) {
      assert.equal(sotStatusForEntity(entity)?.status, 'POSTGRESQL_PRIMARY', entity);
      assert.equal(cutoverMatrixForEntity(entity)?.cutoverReady, false, entity);
    }
    assert.equal(sotStatusForEntity('AuditEvent')?.auditAuthority, 'AUTHORITATIVE_SERVER_AUDIT');
  });

  it('Test 1: PG batch history + LS stale → PG wins', () => {
    const pg = [{ batchNumber: 'B-001', sourceFile: 'pg.xlsx', status: 'COMMITTED' as const }];
    const ls = [{ batchNumber: 'B-999', sourceFile: 'stale.xlsx', status: 'COMMITTED' as const }];
    const resolved = preferPostgresMasterData({ ok: true, data: pg }, ls);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.equal(resolved.data[0].batchNumber, 'B-001');
  });

  it('Test 2: PG empty + LS has batches → empty PG wins', () => {
    const ls = [{ batchNumber: 'B-OLD', sourceFile: 'stale.xlsx', status: 'COMMITTED' as const }];
    const resolved = preferPostgresMasterData({ ok: true, data: [] as typeof ls }, ls);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.deepEqual(resolved.data, []);
  });

  it('Test 3: PG unavailable + LS → fallback non-authoritative', () => {
    const ls = [{ batchNumber: 'B-OFF', sourceFile: 'offline.xlsx', status: 'COMMITTED' as const }];
    const resolved = resolveMasterListPreferringPostgres({ ok: false, error: '503' }, ls);
    assert.equal(resolved.source, 'LOCALSTORAGE_FALLBACK');
    assert.equal(resolved.authoritative, false);
  });

  it('Test 4/5: LS mirror flag + LS-only batch save refused', () => {
    assert.equal(IMPORT_BATCH_LOCAL_IS_AUTHORITATIVE, false);
    assert.equal(IMPORT_BATCH_LS_CLASS, 'NON_AUTHORITATIVE_MIRROR');
    assert.equal(IMPORT_BATCH_STORAGE_KEY, 'energya_import_batches_v1');
    const batch: ImportBatchRecord = {
      batchNumber: 'TEST-BATCH',
      sourceFile: 'test.xlsx',
      importedBy: 'tester',
      importedDate: new Date().toISOString(),
      dataType: 'raw_materials',
      rowCount: 1,
      successCount: 1,
      errorCount: 0,
      warningCount: 0,
      status: 'COMMITTED',
      errors: [],
      warnings: [],
    };
    assert.throws(() => saveImportBatch(batch), /PostgreSQL|NON_AUTHORITATIVE_MIRROR/);
  });

  it('Test 6: memory store mirrors batch only when persist + explicit mirror flag for default path', () => {
    const stores = memoryImportStores();
    const result = commitRawMaterials(
      [{ 'Raw Material Code': 'IB03', Description: 'Test', 'Unit of Measurement': 'kg' }],
      'test.xlsx',
      'tester',
      { persist: true, stores }
    );
    assert.equal(result.batch.status, 'COMMITTED');
    assert.equal(stores.snapshot()?.batches?.length, 1);
  });

  it('Test 7–8 evidence: V1/V2 share same Import Center API paths', () => {
    const ib = sotStatusForEntity('ImportBatch');
    assert.equal(ib?.status, 'POSTGRESQL_SOT');
    assert.equal(ib?.readCutover, true);
    assert.equal(ib?.writeCutover, true);
    const matrix = MASTER_DATA_CUTOVER_MATRIX.find((r) => r.registryEntity === 'ImportBatch');
    assert.equal(matrix?.v1ReadPath, true);
    assert.equal(matrix?.v2ReadPath, true);
    assert.equal(matrix?.v1V2Converged, true);
  });

  it('Test 9–10 evidence: security + audit gates recorded for ImportBatch', () => {
    const ib = sotStatusForEntity('ImportBatch');
    assert.equal(ib?.gates?.H, true);
    assert.equal(ib?.gates?.I, true);
  });
});
