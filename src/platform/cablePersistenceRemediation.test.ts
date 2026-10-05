import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import {
  allCutoverGatesPassed,
  canPromoteToPostgresqlSot,
  cutoverMatrixForEntity,
  preferPostgresMasterData,
  sotStatusForEntity,
} from './masterDataSoT';
import { resolveMasterListPreferringPostgres } from '../services/masterDataApiService';
import {
  CABLE_CATALOG_LOCAL_IS_AUTHORITATIVE,
  CABLE_CATALOG_LS_CLASS,
  CABLE_CATALOG_STORAGE_KEY,
  saveCableCatalog,
} from '../services/cableCatalogService';
import { getAllParsedCablesOfflineFallback, resolveAllParsedCables } from '../services/cableSelectionService';
import {
  getAllMasterRecordsV2OfflineFallback,
  resolveAllMasterRecordsV2,
} from '../components/cable-configurator/v2/services/cableSelectionEngineV2';
import { checkDatabase, disconnectPrisma, getPrisma } from '../server/db';
import { createCable } from '../server/masterDataRepository';

dotenv.config();

describe('Task 04B-6 Cable Master persistence remediation', () => {
  it('CableMaster promoted to POSTGRESQL_SOT after 04B-7 formal reassessment', () => {
    const cable = sotStatusForEntity('CableMaster');
    assert.ok(cable);
    assert.equal(cable.status, 'POSTGRESQL_SOT');
    assert.equal(cable.postgresSoT, true);
    assert.equal(cable.cutoverPhase, 'POSTGRESQL_SOT');
    assert.equal(cable.gates?.C, true);
    assert.equal(canPromoteToPostgresqlSot(cable), true);
  });

  it('matrix records 04B-7 Cable Master POSTGRESQL_SOT cutover', () => {
    const row = cutoverMatrixForEntity('Cable Master');
    assert.ok(row);
    assert.equal(row.cutoverReady, true);
    assert.equal(row.currentSoTStatus, 'POSTGRESQL_SOT');
    assert.equal(row.v1V2Converged, true);
    assert.match(row.gate04B || '', /04B-7/i);
    assert.equal(row.lsWritePathsRemaining, true);
  });

  it('refuses LS-only saveCableCatalog writes (mirrorAfterPgSuccess required)', () => {
    assert.equal(CABLE_CATALOG_LOCAL_IS_AUTHORITATIVE, false);
    assert.equal(CABLE_CATALOG_LS_CLASS, 'NON_AUTHORITATIVE_MIRROR');
    assert.equal(CABLE_CATALOG_STORAGE_KEY, 'energya_master_cable_catalog_v3');
    assert.throws(
      () => saveCableCatalog([{ id: 'x', cableCode: '1', itemCode: 'i', customerCode: 'c', description: 'd' } as any]),
      /NON_AUTHORITATIVE_MIRROR|PostgreSQL/
    );
  });

  it('stale LS cannot override PG; empty PG beats LS; PG failure is non-authoritative', () => {
    const pg = [{ id: 'pg', cableCode: '10009487', description: 'from postgres' }];
    const ls = [{ id: 'ls', cableCode: '10009487', description: 'stale local' }];
    const resolved = preferPostgresMasterData({ ok: true, data: pg }, ls);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.equal(resolved.data[0].description, 'from postgres');

    const emptyPg = preferPostgresMasterData({ ok: true, data: [] as typeof ls }, ls);
    assert.deepEqual(emptyPg.data, []);
    assert.equal(emptyPg.authoritative, true);

    const fallback = resolveMasterListPreferringPostgres({ ok: false, error: '503' }, ls);
    assert.equal(fallback.authoritative, false);
    assert.equal(fallback.source, 'LOCALSTORAGE_FALLBACK');
  });

  it('selection engine offline fallbacks are explicitly non-authoritative', () => {
    const v1 = getAllParsedCablesOfflineFallback();
    const v2 = getAllMasterRecordsV2OfflineFallback();
    assert.equal(v1.authoritative, false);
    assert.equal(v2.authoritative, false);
    assert.equal(v1.source, 'LOCALSTORAGE_FALLBACK');
    assert.equal(v2.source, 'LOCALSTORAGE_FALLBACK');
  });

  it('resolveAllParsedCables / resolveAllMasterRecordsV2 expose PG-first contract', async () => {
    const parsed = await resolveAllParsedCables(null);
    const v2 = await resolveAllMasterRecordsV2(null);
    assert.equal(typeof parsed.authoritative, 'boolean');
    assert.equal(typeof v2.authoritative, 'boolean');
    assert.ok(['POSTGRESQL', 'LOCALSTORAGE_FALLBACK'].includes(parsed.source));
    assert.ok(['POSTGRESQL', 'LOCALSTORAGE_FALLBACK'].includes(v2.source));
  });

  it('does not falsely promote sibling entities', () => {
    for (const entity of ['CableBomLine', 'CableParameter']) {
      assert.equal(sotStatusForEntity(entity)?.status, 'POSTGRESQL_PRIMARY', entity);
      assert.equal(cutoverMatrixForEntity(entity)?.cutoverReady, false, entity);
    }
    assert.equal(sotStatusForEntity('DrumMaster')?.status, 'POSTGRESQL_SOT');
  });
});

describe('Task 04B-6 Cable Master PG write + audit evidence', () => {
  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error || 'PostgreSQL required');
  });

  after(async () => {
    await disconnectPrisma();
  });

  it('createCable writes AuditEvent (TCR/Excel path uses same repository)', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const materialNumber = `B46-${Date.now()}`;
    await createCable(
      {
        id: `mc-${materialNumber}`,
        itemCode: 'B46ITEM',
        cableCode: materialNumber,
        customerCode: 'N2XH',
        code: `N2XH ${materialNumber}`,
        description: '04B-6 remediation audit cable',
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
      { id: 'test-04b6', name: '04b6-test' }
    );
    const audit = await prisma.auditEvent.findFirst({
      where: { entity: 'CableMaster', entityId: materialNumber, action: 'CREATE' },
      orderBy: { at: 'desc' },
    });
    assert.ok(audit);
    await prisma.auditEvent.deleteMany({ where: { entityId: materialNumber } });
    await prisma.cableMaster.delete({ where: { materialNumber } });
  });

  it('Gates A–J pass; CableMaster POSTGRESQL_SOT after 04B-7', () => {
    const cable = sotStatusForEntity('CableMaster');
    assert.ok(cable);
    assert.equal(cable.gates?.C, true);
    assert.equal(cable.gates?.B, true);
    assert.equal(cable.gates?.D, true);
    assert.equal(allCutoverGatesPassed(cable.gates), true);
    assert.equal(cable.status, 'POSTGRESQL_SOT');
    assert.equal(canPromoteToPostgresqlSot(cable), true);
  });
});
