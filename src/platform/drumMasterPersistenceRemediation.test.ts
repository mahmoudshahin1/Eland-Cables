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
  DRUM_MASTER_LOCAL_IS_AUTHORITATIVE,
  DRUM_MASTER_LS_CLASS,
  DRUM_MASTER_STORAGE_KEY,
  deactivateDrum,
  resolveDrumEngineeringFields,
  saveDrumMaster,
} from '../services/drumMasterService';
import { commitDrums, memoryImportStores } from '../services/importPipelineService';
import { checkDatabase, disconnectPrisma, getPrisma } from '../server/db';
import { createDrum, getDrum } from '../server/drumMasterWriteRepository';
import { listDrums } from '../server/masterDataRepository';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Task 04B-11 Drum Master persistence remediation', () => {
  it('A — DrumMaster promoted to POSTGRESQL_SOT after 04B-12 reassessment', () => {
    const drum = sotStatusForEntity('DrumMaster');
    assert.ok(drum);
    assert.equal(drum.status, 'POSTGRESQL_SOT');
    assert.equal(drum.postgresSoT, true);
    assert.equal(drum.cutoverPhase, 'POSTGRESQL_SOT');
    assert.equal(canPromoteToPostgresqlSot(drum), true);
  });

  it('B — Gate C remediated — import + full PG CRUD paths', () => {
    const drum = sotStatusForEntity('DrumMaster');
    assert.ok(drum);
    assert.equal(drum.gates?.C, true);
    assert.equal(drum.gates?.I, true);
    assert.equal(allCutoverGatesPassed(drum.gates), true);
    assert.equal(canPromoteToPostgresqlSot(drum), true, '04B-12 cutover after DrumCompatibility decoupled');
  });

  it('C — cutover matrix ready — DrumCompatibility decoupled from Drum Master promotion', () => {
    const row = cutoverMatrixForEntity('DrumMaster');
    assert.ok(row);
    assert.equal(row.cutoverReady, true);
    assert.equal(row.currentSoTStatus, 'POSTGRESQL_SOT');
    assert.equal(row.lsWritePathsRemaining, false);
    assert.equal(row.blockingReason, null);
  });

  it('D — commitDrums maps Clearance / MaxLoad / Empty weight from Excel', () => {
    const stores = memoryImportStores();
    const result = commitDrums(
      [
        {
          'Drum Code': 'EWD-04B11-D',
          Flange: 630,
          Barrel: 300,
          'Inner Width': 600,
          'Outer Width': 760,
          Capacity: 650,
          'Clearance Mm': 20,
          'Max Load Kg': 2000,
          'Empty Drum Net Weight Kg': 110,
        },
      ],
      'Drum List Engineering.xlsx',
      'tester',
      { persist: true, stores }
    );
    assert.equal(result.batch.status, 'COMMITTED');
    const drum = stores.getDrums()[0];
    assert.equal(drum.clearanceMm, 20);
    assert.equal(drum.maxWeight, 2000);
    assert.equal(drum.emptyDrumNetWeightKg, 110);
  });

  it('E — refuses LS-only saveDrumMaster writes (mirrorAfterPgSuccess required)', () => {
    assert.equal(DRUM_MASTER_LOCAL_IS_AUTHORITATIVE, false);
    assert.equal(DRUM_MASTER_LS_CLASS, 'NON_AUTHORITATIVE_MIRROR');
    assert.equal(DRUM_MASTER_STORAGE_KEY, 'energya_drum_master_v1');
    assert.throws(
      () =>
        saveDrumMaster([
          {
            id: 'x',
            drumCode: 'EWD001',
            flange: 630,
            barrel: 300,
            innerWidth: 600,
            outerWidth: 760,
            capacity: 650,
            dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
            capacityUom: 'CONFIGURATION_REQUIRED',
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]),
      /NON_AUTHORITATIVE_MIRROR|PostgreSQL/
    );
  });

  it('F — stale LS cannot override PG; PG failure is non-authoritative', () => {
    const pg = [{ id: 'pg', drumCode: 'EWD630-0', capacity: 650 }];
    const ls = [{ id: 'ls', drumCode: 'EWD630-0', capacity: 999 }];
    const resolved = preferPostgresMasterData({ ok: true, data: pg }, ls);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.equal(resolved.data[0].capacity, 650);

    const fallback = resolveMasterListPreferringPostgres({ ok: false, error: '503' }, ls);
    assert.equal(fallback.authoritative, false);
    assert.equal(fallback.source, 'LOCALSTORAGE_FALLBACK');
  });

  it('G — DrumCompatibility remains BLOCKED — not promoted', () => {
    const compat = sotStatusForEntity('DrumCompatibility');
    assert.ok(compat);
    assert.equal(compat.status, 'BLOCKED');
    assert.equal(compat.postgresSoT, false);
    assert.equal(canPromoteToPostgresqlSot(compat), false);
  });

  it('H — drum optimization service does not mutate Drum Master', () => {
    const source = readFileSync(
      path.join(__dirname, '../domain/drumOptimizationService.ts'),
      'utf8'
    );
    assert.doesNotMatch(source, /prisma\.|drumMaster\.(create|update|upsert|delete)/);
    assert.doesNotMatch(source, /saveDrumMaster|persistImportTransaction/);
  });

  it('J — TO defaults: Clearance 50 and MaxLoad from Capacity when absent', () => {
    const resolved = resolveDrumEngineeringFields(650, {});
    assert.equal(resolved.clearanceMm, 50);
    assert.equal(resolved.maxWeight, 650);
    assert.equal(resolved.emptyDrumNetWeightKg, null);
    assert.ok(resolved.warnings.some((w) => /Clearance Mm defaulted to 50/i.test(w.message)));
    assert.ok(resolved.warnings.some((w) => /MaxLoad set from Capacity/i.test(w.message)));
  });

  it('K — deactivateDrum LS-only path is blocked', () => {
    assert.throws(() => deactivateDrum('EWD630-0'), /PostgreSQL|NON_AUTHORITATIVE_MIRROR/);
  });

  it('L — all gates pass and promotion accepted (04B-12)', () => {
    const drum = sotStatusForEntity('DrumMaster');
    assert.ok(drum);
    assert.equal(allCutoverGatesPassed(drum.gates), true);
    assert.equal(drum.cutoverPhase, 'POSTGRESQL_SOT');
    assert.equal(canPromoteToPostgresqlSot(drum), true);
  });

  it('M — commitDrums TO defaults when engineering columns blank', () => {
    const stores = memoryImportStores();
    const result = commitDrums(
      [
        {
          'Drum Code': 'EWD-04B11-M',
          Flange: 630,
          Barrel: 300,
          'Inner Width': 600,
          'Outer Width': 760,
          Capacity: 650,
          'Clearance Mm': '',
          'Max Load Kg': '',
        },
      ],
      'Drum List.xlsx',
      'tester',
      { persist: true, stores }
    );
    assert.equal(result.batch.status, 'COMMITTED');
    const drum = stores.getDrums()[0];
    assert.equal(drum.maxWeight, 650);
    assert.equal(drum.clearanceMm, 50);
  });

  it('N — framework next cutover entity remains CableBomLine', () => {
    assert.equal(MASTER_DATA_CUTOVER_FRAMEWORK.nextEntityCutover, 'CableBomLine');
  });

  it('O — DrumCompatibility 0 rows is downstream entity, not Drum Master prerequisite', () => {
    const row = cutoverMatrixForEntity('DrumMaster');
    assert.ok(row);
    assert.equal(row.pgWriteComplete, true);
    assert.equal(row.cutoverReady, true);
    const compat = cutoverMatrixForEntity('DrumCompatibility');
    assert.ok(compat);
    assert.equal(compat.cutoverReady, false);
    assert.equal(sotStatusForEntity('DrumMaster')?.status, 'POSTGRESQL_SOT');
  });
});

describe('Task 04B-11 Drum Master PG write + audit evidence', () => {
  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error || 'PostgreSQL required');
  });

  after(async () => {
    await disconnectPrisma();
  });

  it('I — createDrum writes AuditEvent (entity DrumMaster)', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const drumCode = `T04B11-${Date.now()}`;
    const created = await createDrum(
      {
        id: `drm-${drumCode}`,
        drumCode,
        flange: 630,
        barrel: 300,
        innerWidth: 600,
        outerWidth: 760,
        capacity: 650,
        dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
        capacityUom: 'CONFIGURATION_REQUIRED',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { id: 'test-04b11', name: '04b11-test' }
    );
    assert.equal(created.clearanceMm, 50);
    assert.equal(created.maxWeight, 650);

    const audit = await prisma.auditEvent.findFirst({
      where: { entity: 'DrumMaster', entityId: drumCode, action: 'CREATE' },
      orderBy: { at: 'desc' },
    });
    assert.ok(audit);

    const fetched = await getDrum(drumCode);
    assert.ok(fetched);
    assert.equal(fetched?.maxWeight, 650);

    await prisma.auditEvent.deleteMany({ where: { entityId: drumCode } });
    await prisma.drumMaster.delete({ where: { drumCode } });
  });

  it('listDrums returns PG-backed rows', async () => {
    const drums = await listDrums();
    assert.ok(Array.isArray(drums));
  });
});
