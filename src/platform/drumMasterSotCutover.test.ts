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
  DRUM_MASTER_LOCAL_IS_AUTHORITATIVE,
  DRUM_MASTER_LS_CLASS,
  DRUM_MASTER_STORAGE_KEY,
} from '../services/drumMasterService';

describe('Task 04B-12 Drum Master PostgreSQL SoT cutover', () => {
  it('promotes DrumMaster to POSTGRESQL_SOT with all gates A–J', () => {
    const drum = sotStatusForEntity('DrumMaster');
    assert.ok(drum);
    assert.equal(drum.status, 'POSTGRESQL_SOT');
    assert.equal(drum.postgresSoT, true);
    assert.equal(drum.cutoverPhase, 'POSTGRESQL_SOT');
    assert.equal(drum.localStorageAuthority, false);
    assert.equal(drum.localStorageCompatibilityMirror, true);
    assert.equal(allCutoverGatesPassed(drum.gates), true);
    assert.equal(canPromoteToPostgresqlSot(drum), true);
  });

  it('matrix marks Drum Master cutover ready without DrumCompatibility coupling', () => {
    const row = cutoverMatrixForEntity('Drum Master');
    assert.ok(row);
    assert.equal(row.currentSoTStatus, 'POSTGRESQL_SOT');
    assert.equal(row.cutoverReady, true);
    assert.equal(row.blockingReason, null);
    assert.equal(row.lsAuthoritative, false);
    assert.equal(row.mirrorAllowed, true);
    assert.equal(row.pgWriteComplete, true);
    assert.equal(row.v1V2Converged, true);
    assert.match(row.gate04B || '', /04B-12/i);
    assert.ok(MASTER_DATA_CUTOVER_FRAMEWORK.entityCutoversCompleted.includes('DrumMaster'));
  });

  it('DrumCompatibility remains BLOCKED — separate downstream entity', () => {
    const compat = sotStatusForEntity('DrumCompatibility');
    assert.ok(compat);
    assert.equal(compat.status, 'BLOCKED');
    assert.equal(compat.postgresSoT, false);
    assert.equal(canPromoteToPostgresqlSot(compat), false);
    assert.equal(cutoverMatrixForEntity('DrumCompatibility')?.cutoverReady, false);
  });

  it('does not promote sibling PRIMARY entities via Drum cutover', () => {
    assert.equal(sotStatusForEntity('CableMaster')?.status, 'POSTGRESQL_SOT');
    for (const entity of ['CableBomLine', 'CableParameter']) {
      assert.equal(sotStatusForEntity(entity)?.status, 'POSTGRESQL_PRIMARY', entity);
      assert.equal(cutoverMatrixForEntity(entity)?.cutoverReady, false, entity);
    }
    assert.ok(MASTER_DATA_CUTOVER_MATRIX.some((r) => r.registryEntity === 'DrumMaster' && r.cutoverReady));
  });

  it('LS mirror is non-authoritative (gate E evidence)', () => {
    assert.equal(DRUM_MASTER_LOCAL_IS_AUTHORITATIVE, false);
    assert.equal(DRUM_MASTER_LS_CLASS, 'NON_AUTHORITATIVE_MIRROR');
    assert.equal(DRUM_MASTER_STORAGE_KEY, 'energya_drum_master_v1');
  });

  it('stale LS cannot override successful PG read (gates F/G)', () => {
    const pg = [{ id: 'pg', drumCode: 'EWD630-0', capacity: 650 }];
    const ls = [{ id: 'ls', drumCode: 'EWD630-0', capacity: 999 }];
    const resolved = preferPostgresMasterData({ ok: true, data: pg }, ls);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.equal(resolved.data[0].capacity, 650);

    const emptyPg = preferPostgresMasterData({ ok: true, data: [] }, ls);
    assert.deepEqual(emptyPg.data, []);

    const fallback = resolveMasterListPreferringPostgres({ ok: false, error: '503' }, ls);
    assert.equal(fallback.authoritative, false);
  });

  it('framework next cutover entity remains CableBomLine', () => {
    assert.equal(MASTER_DATA_CUTOVER_FRAMEWORK.nextEntityCutover, 'CableBomLine');
  });
});
