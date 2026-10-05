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
  DRUM_MASTER_LOCAL_IS_AUTHORITATIVE,
  DRUM_MASTER_STORAGE_KEY,
} from '../services/drumMasterService';

describe('Task 04B-10/04B-12 Drum Master SoT (04B-12 cutover accepted)', () => {
  it('DrumMaster promoted to POSTGRESQL_SOT after gates A–J pass', () => {
    const drum = sotStatusForEntity('DrumMaster');
    assert.ok(drum);
    assert.equal(drum.status, 'POSTGRESQL_SOT');
    assert.equal(drum.postgresSoT, true);
    assert.equal(drum.cutoverPhase, 'POSTGRESQL_SOT');
    assert.equal(drum.gates?.C, true, 'Gate C remediated in 04B-11');
    assert.equal(allCutoverGatesPassed(drum.gates), true);
    assert.equal(canPromoteToPostgresqlSot(drum), true);
  });

  it('cutover matrix marks Drum Master ready after 04B-12', () => {
    const row = cutoverMatrixForEntity('Drum Master');
    assert.ok(row);
    assert.equal(row.cutoverReady, true);
    assert.equal(row.currentSoTStatus, 'POSTGRESQL_SOT');
    assert.equal(row.lsWritePathsRemaining, false);
    assert.equal(row.pgWriteComplete, true);
    assert.equal(row.blockingReason, null);
  });

  it('DrumCompatibility remains BLOCKED — not promoted', () => {
    const compat = sotStatusForEntity('DrumCompatibility');
    assert.ok(compat);
    assert.equal(compat.status, 'BLOCKED');
    assert.equal(compat.postgresSoT, false);
    assert.equal(canPromoteToPostgresqlSot(compat), false);
  });

  it('LS mirror is non-authoritative (gate E evidence)', () => {
    assert.equal(DRUM_MASTER_LOCAL_IS_AUTHORITATIVE, false);
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

  it('does not falsely promote sibling entities', () => {
    assert.equal(sotStatusForEntity('CableMaster')?.status, 'POSTGRESQL_SOT');
    assert.equal(sotStatusForEntity('DrumMaster')?.status, 'POSTGRESQL_SOT');
    assert.equal(sotStatusForEntity('CableBomLine')?.status, 'POSTGRESQL_PRIMARY');
    assert.equal(MASTER_DATA_CUTOVER_FRAMEWORK.nextEntityCutover, 'CableBomLine');
  });
});
