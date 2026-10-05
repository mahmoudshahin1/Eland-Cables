import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MASTER_DATA_CUTOVER_MATRIX,
  allCutoverGatesPassed,
  canPromoteToPostgresqlSot,
  cutoverMatrixForEntity,
  preferPostgresMasterData,
  sotStatusForEntity,
} from './masterDataSoT';
import { resolveMasterListPreferringPostgres } from '../services/masterDataApiService';
import {
  CABLE_CATALOG_LOCAL_IS_AUTHORITATIVE,
  CABLE_CATALOG_STORAGE_KEY,
} from '../services/cableCatalogService';

describe('Task 04B-7 Cable Master SoT cutover (accepted)', () => {
  it('CableMaster promoted to POSTGRESQL_SOT after gates A–J pass', () => {
    const cable = sotStatusForEntity('CableMaster');
    assert.ok(cable);
    assert.equal(cable.status, 'POSTGRESQL_SOT');
    assert.equal(cable.postgresSoT, true);
    assert.equal(cable.cutoverPhase, 'POSTGRESQL_SOT');
    assert.equal(cable.gates?.C, true, 'Gate C remediated in 04B-6');
    assert.equal(cable.gates?.B, true, 'Gate B: V1 cascading filters use PG catalog (04B-6A)');
    assert.equal(cable.gates?.D, true, 'Gate D: V1/V2 read-path convergence (04B-6A)');
    assert.equal(allCutoverGatesPassed(cable.gates), true);
    assert.equal(canPromoteToPostgresqlSot(cable), true);
  });

  it('cutover matrix marks Cable Master ready after 04B-7', () => {
    const row = cutoverMatrixForEntity('Cable Master');
    assert.ok(row);
    assert.equal(row.cutoverReady, true);
    assert.equal(row.currentSoTStatus, 'POSTGRESQL_SOT');
    assert.equal(row.lsWritePathsRemaining, true);
    assert.equal(row.pgWriteComplete, true);
    assert.equal(row.v1V2Converged, true);
  });

  it('LS mirror is non-authoritative (gate E evidence)', () => {
    assert.equal(CABLE_CATALOG_LOCAL_IS_AUTHORITATIVE, false);
    assert.equal(CABLE_CATALOG_STORAGE_KEY, 'energya_master_cable_catalog_v3');
  });

  it('stale LS cannot override successful PG read (gates F/G)', () => {
    const pg = [{ id: 'pg', cableCode: '10009487', description: 'from postgres' }];
    const ls = [{ id: 'ls', cableCode: '10009487', description: 'stale local' }];
    const resolved = preferPostgresMasterData({ ok: true, data: pg }, ls);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.equal(resolved.data[0].description, 'from postgres');

    const emptyPg = preferPostgresMasterData({ ok: true, data: [] as typeof ls }, ls);
    assert.deepEqual(emptyPg.data, []);

    const fallback = resolveMasterListPreferringPostgres({ ok: false, error: '503' }, ls);
    assert.equal(fallback.authoritative, false);
  });

  it('does not falsely promote sibling entities', () => {
    for (const entity of ['CableBomLine', 'CableParameter']) {
      assert.equal(sotStatusForEntity(entity)?.status, 'POSTGRESQL_PRIMARY', entity);
      assert.equal(cutoverMatrixForEntity(entity)?.cutoverReady, false, entity);
    }
    assert.equal(sotStatusForEntity('DrumMaster')?.status, 'POSTGRESQL_SOT');
    assert.ok(MASTER_DATA_CUTOVER_MATRIX.some((r) => r.registryEntity === 'CableMaster' && r.cutoverReady));
    assert.ok(MASTER_DATA_CUTOVER_MATRIX.some((r) => r.registryEntity === 'DrumMaster' && r.cutoverReady));
  });
});
