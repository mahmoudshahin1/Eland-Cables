import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MASTER_DATA_CUTOVER_FRAMEWORK,
  allCutoverGatesPassed,
  canPromoteToPostgresqlSot,
  cutoverMatrixForEntity,
  preferPostgresMasterData,
  sotStatusForEntity,
} from './masterDataSoT';
import { resolveMasterListPreferringPostgres } from '../services/masterDataApiService';
import {
  BOM_LOCAL_IS_AUTHORITATIVE,
  BOM_STORAGE_KEY,
} from '../services/cableBomService';

describe('Task 04B-8/04B-9 Cable BOM SoT readiness (discovery — cutover blocked)', () => {
  it('CableBomLine remains POSTGRESQL_PRIMARY — not promoted', () => {
    const bom = sotStatusForEntity('CableBomLine');
    assert.ok(bom);
    assert.equal(bom.status, 'POSTGRESQL_PRIMARY');
    assert.equal(bom.postgresSoT, false);
    assert.equal(bom.cutoverPhase, 'LS_NON_AUTHORITATIVE');
    assert.notEqual(bom.cutoverPhase, 'CUTOVER_READY');
    assert.equal(bom.gates?.C, true, 'Gate C remediated in 04B-9');
    assert.equal(allCutoverGatesPassed(bom.gates), true);
    assert.equal(canPromoteToPostgresqlSot(bom), false);
  });

  it('cutover matrix marks Cable BOM not ready (04B-9 governance debt)', () => {
    const row = cutoverMatrixForEntity('CableBomLine');
    assert.ok(row);
    assert.equal(row.cutoverReady, false);
    assert.equal(row.currentSoTStatus, 'POSTGRESQL_PRIMARY');
    assert.equal(row.lsWritePathsRemaining, false);
    assert.match(String(row.blockingReason || ''), /81|governance|BomDuplicateObservation/i);
  });

  it('ExcelMethodBCableBomUpload remediated — PG write path (04B-9)', () => {
    const blocked = sotStatusForEntity('ExcelMethodBCableBomUpload');
    assert.ok(blocked);
    assert.equal(blocked.status, 'POSTGRESQL_PRIMARY');
    assert.equal(blocked.localStorageAuthority, false);
    assert.equal(blocked.gates?.C, true);
    assert.equal(canPromoteToPostgresqlSot(blocked), false);
  });

  it('LS mirror is non-authoritative (gate E evidence)', () => {
    assert.equal(BOM_LOCAL_IS_AUTHORITATIVE, false);
    assert.equal(BOM_STORAGE_KEY, 'energya_cable_boms_v3');
  });

  it('stale LS cannot override successful PG read (gates F/G)', () => {
    const pg = [{ id: 'pg', cableMaterialNumber: '10009487', rawMaterial: 'CR01', weight: 1, unitKm: 'kg' }];
    const ls = [{ id: 'ls', cableMaterialNumber: '10009487', rawMaterial: 'CR01', weight: 999, unitKm: 'kg' }];
    const resolved = preferPostgresMasterData({ ok: true, data: pg }, ls);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.equal(resolved.data[0].weight, 1);

    const fallback = resolveMasterListPreferringPostgres({ ok: false, error: '503' }, ls);
    assert.equal(fallback.authoritative, false);
  });

  it('framework next cutover entity is CableBomLine', () => {
    assert.equal(MASTER_DATA_CUTOVER_FRAMEWORK.nextEntityCutover, 'CableBomLine');
  });
});
