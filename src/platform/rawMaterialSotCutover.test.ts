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
  RAW_MATERIAL_LOCAL_IS_AUTHORITATIVE,
  RAW_MATERIAL_LS_CLASS,
  RAW_MATERIAL_STORAGE_KEY,
  deactivateRawMaterial,
} from '../services/rawMaterialMasterService';

describe('Task 04B-2 Raw Material PostgreSQL SoT cutover', () => {
  it('promotes RawMaterial to POSTGRESQL_SOT with all gates A–J', () => {
    const rm = sotStatusForEntity('RawMaterial');
    assert.ok(rm);
    assert.equal(rm.status, 'POSTGRESQL_SOT');
    assert.equal(rm.postgresSoT, true);
    assert.equal(rm.cutoverPhase, 'POSTGRESQL_SOT');
    assert.equal(rm.localStorageAuthority, false);
    assert.equal(rm.localStorageCompatibilityMirror, true);
    assert.equal(allCutoverGatesPassed(rm.gates), true);
    assert.equal(canPromoteToPostgresqlSot(rm), true);
  });

  it('matrix marks Raw Material cutover ready without blocking reason', () => {
    const row = cutoverMatrixForEntity('Raw Material');
    assert.ok(row);
    assert.equal(row.currentSoTStatus, 'POSTGRESQL_SOT');
    assert.equal(row.cutoverReady, true);
    assert.equal(row.blockingReason, null);
    assert.equal(row.lsAuthoritative, false);
    assert.equal(row.mirrorAllowed, true);
    assert.equal(MASTER_DATA_CUTOVER_FRAMEWORK.entityCutoversExecuted, true);
    assert.ok(MASTER_DATA_CUTOVER_FRAMEWORK.entityCutoversCompleted.includes('RawMaterial'));
  });

  it('does not promote sibling PRIMARY entities via RM cutover', () => {
    assert.equal(sotStatusForEntity('CableMaster')?.status, 'POSTGRESQL_SOT');
    assert.equal(sotStatusForEntity('DrumMaster')?.status, 'POSTGRESQL_SOT');
    for (const entity of ['CableBomLine']) {
      assert.equal(sotStatusForEntity(entity)?.status, 'POSTGRESQL_PRIMARY', entity);
      assert.equal(cutoverMatrixForEntity(entity)?.cutoverReady, false, entity);
    }
    assert.equal(sotStatusForEntity('AuditEvent')?.auditAuthority, 'AUTHORITATIVE_SERVER_AUDIT');
  });

  it('Test 1: PG data + LS stale → PG wins', () => {
    const pg = [{ rawMaterialCode: 'RM-001', description: 'Copper', uom: 'kg', status: 'ACTIVE' as const }];
    const ls = [{ rawMaterialCode: 'RM-001', description: 'OLD MATERIAL', uom: 'kg', status: 'ACTIVE' as const }];
    const resolved = preferPostgresMasterData({ ok: true, data: pg }, ls);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.equal(resolved.data[0].description, 'Copper');
  });

  it('Test 2: PG empty + LS has data → empty PG wins', () => {
    const ls = [{ rawMaterialCode: 'RM-001', description: 'OLD MATERIAL', uom: 'kg', status: 'ACTIVE' as const }];
    const resolved = preferPostgresMasterData({ ok: true, data: [] as typeof ls }, ls);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.deepEqual(resolved.data, []);
  });

  it('Test 3: PG unavailable + LS → fallback non-authoritative', () => {
    const ls = [{ rawMaterialCode: 'RM-001', description: 'OFFLINE', uom: 'kg', status: 'ACTIVE' as const }];
    const resolved = resolveMasterListPreferringPostgres({ ok: false, error: '503' }, ls);
    assert.equal(resolved.source, 'LOCALSTORAGE_FALLBACK');
    assert.equal(resolved.authoritative, false);
  });

  it('Test 4/5: LS mirror flag + LS-only deactivate refused (writes must be PG)', () => {
    assert.equal(RAW_MATERIAL_LOCAL_IS_AUTHORITATIVE, false);
    assert.equal(RAW_MATERIAL_LS_CLASS, 'NON_AUTHORITATIVE_MIRROR');
    assert.equal(RAW_MATERIAL_STORAGE_KEY, 'energya_raw_material_master_v1');
    assert.throws(() => deactivateRawMaterial('RM-001'), /PostgreSQL|NON_AUTHORITATIVE_MIRROR/);
  });

  it('Test 6–8 evidence: V1/V2/Costing share same SoT registry entity', () => {
    const rm = sotStatusForEntity('RawMaterial');
    assert.equal(rm?.status, 'POSTGRESQL_SOT');
    assert.equal(rm?.readCutover, true);
    assert.equal(rm?.writeCutover, true);
    const matrix = MASTER_DATA_CUTOVER_MATRIX.find((r) => r.registryEntity === 'RawMaterial');
    assert.equal(matrix?.v1ReadPath, true);
    assert.equal(matrix?.v2ReadPath, true);
    assert.equal(matrix?.v1V2Converged, true);
  });

  it('Test 9–10 evidence: security + audit gates recorded for RawMaterial', () => {
    const rm = sotStatusForEntity('RawMaterial');
    assert.equal(rm?.gates?.H, true);
    assert.equal(rm?.gates?.I, true);
  });
});
