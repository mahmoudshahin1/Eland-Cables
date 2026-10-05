import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MASTER_DATA_CUTOVER_FRAMEWORK,
  MASTER_DATA_CUTOVER_GATE_DEFINITIONS,
  MASTER_DATA_CUTOVER_MATRIX,
  MASTER_DATA_CUTOVER_ORDER,
  MASTER_DATA_CUTOVER_STOP_CONDITIONS,
  MASTER_DATA_KEY_CLASSIFICATION,
  MASTER_DATA_SOT_STATUS,
  allCutoverGatesPassed,
  canPromoteToPostgresqlSot,
  cutoverMatrixForEntity,
  entitiesNotCutoverReady,
  isAuthoritativeServerAudit,
  preferPostgresMasterData,
  postgresqlPrimaryOrSotEntities,
  sotStatusForEntity,
} from './masterDataSoT';

describe('Task 04A MasterDataSoT registry (honest statuses)', () => {
  it('marks Customer as POSTGRESQL_SOT with no LS authority', () => {
    const customer = sotStatusForEntity('Customer');
    assert.ok(customer);
    assert.equal(customer.status, 'POSTGRESQL_SOT');
    assert.equal(customer.postgresSoT, true);
    assert.equal(customer.localStorageAuthority, false);
  });

  it('does NOT claim BOM as POSTGRESQL_SOT yet; CableMaster and DrumMaster are POSTGRESQL_SOT; Audit uses server authority not SoT', () => {
    const cable = sotStatusForEntity('CableMaster');
    assert.ok(cable);
    assert.equal(cable.status, 'POSTGRESQL_SOT');
    assert.equal(cable.postgresSoT, true);
    const drum = sotStatusForEntity('DrumMaster');
    assert.ok(drum);
    assert.equal(drum.status, 'POSTGRESQL_SOT');
    assert.equal(drum.postgresSoT, true);
    for (const entity of ['CableBomLine', 'CableParameter']) {
      const row = sotStatusForEntity(entity);
      assert.ok(row, entity);
      assert.equal(row.status, 'POSTGRESQL_PRIMARY', entity);
      assert.equal(row.postgresSoT, false, entity);
      assert.equal(row.localStorageAuthority, false, entity);
      assert.equal(row.localStorageCompatibilityMirror, true, entity);
    }
    const audit = sotStatusForEntity('AuditEvent');
    assert.ok(audit);
    assert.equal(audit.status, 'POSTGRESQL_PRIMARY');
    assert.equal(audit.postgresSoT, false);
    assert.equal(audit.auditAuthority, 'AUTHORITATIVE_SERVER_AUDIT');
  });

  it('marks ImportBatch as POSTGRESQL_SOT after 04B-3 with LS mirror only', () => {
    const ib = sotStatusForEntity('ImportBatch');
    assert.ok(ib);
    assert.equal(ib.status, 'POSTGRESQL_SOT');
    assert.equal(ib.postgresSoT, true);
    assert.equal(ib.localStorageAuthority, false);
    assert.equal(ib.localStorageCompatibilityMirror, true);
  });

  it('marks RawMaterial as POSTGRESQL_SOT after 04B-2 with LS mirror only', () => {
    const rm = sotStatusForEntity('RawMaterial');
    assert.ok(rm);
    assert.equal(rm.status, 'POSTGRESQL_SOT');
    assert.equal(rm.postgresSoT, true);
    assert.equal(rm.localStorageAuthority, false);
    assert.equal(rm.localStorageCompatibilityMirror, true);
  });

  it('keeps RawMaterialPrice / engineering / costing currencies as POSTGRESQL_SOT', () => {
    assert.equal(sotStatusForEntity('RawMaterialPrice')?.status, 'POSTGRESQL_SOT');
    assert.equal(sotStatusForEntity('CableEngineeringMapping')?.status, 'POSTGRESQL_SOT');
    assert.equal(sotStatusForEntity('CostingCurrency')?.postgresSoT, true);
  });

  it('keeps incomplete / temporary / blocked entities out of postgresSoT', () => {
    assert.equal(sotStatusForEntity('DrumCompatibility')?.status, 'BLOCKED');
    assert.equal(sotStatusForEntity('CustomMasterParams')?.status, 'LOCALSTORAGE_PRIMARY');
    assert.equal(sotStatusForEntity('TechnicalOfficeRequest')?.status, 'DUAL_WRITE');
    assert.equal(sotStatusForEntity('ExcelMethodBCableBomUpload')?.status, 'POSTGRESQL_PRIMARY');
    assert.equal(sotStatusForEntity('ExcelMethodBCableBomUpload')?.postgresSoT, false);
    assert.equal(sotStatusForEntity('DrumCompatibility')?.postgresSoT, false);
  });

  it('exposes typed authority statuses without EAV', () => {
    const allowed = new Set([
      'POSTGRESQL_SOT',
      'POSTGRESQL_PRIMARY',
      'DUAL_WRITE',
      'LOCALSTORAGE_PRIMARY',
      'UI_STATE',
      'NOT_MASTER_DATA',
      'BLOCKED',
    ]);
    assert.ok(MASTER_DATA_SOT_STATUS.length >= 10);
    for (const row of MASTER_DATA_SOT_STATUS) {
      assert.ok(row.entity);
      assert.ok(allowed.has(row.status), row.entity);
    }
    assert.ok(postgresqlPrimaryOrSotEntities().length >= 5);
  });

  it('classifies cable parameter / TCR / audit keys', () => {
    const params = MASTER_DATA_KEY_CLASSIFICATION.find((k) =>
      k.keyPattern.includes('cable_parameter_masters')
    );
    const custom = MASTER_DATA_KEY_CLASSIFICATION.find((k) =>
      k.keyPattern.includes('custom_master_params')
    );
    const tcr = MASTER_DATA_KEY_CLASSIFICATION.find((k) =>
      k.keyPattern.includes('technical_requests')
    );
    const audit = MASTER_DATA_KEY_CLASSIFICATION.find((k) =>
      k.keyPattern.includes('platform_audit')
    );
    assert.equal(params?.class, 'D_OBSOLETE');
    assert.equal(custom?.class, 'B_TEMPORARY');
    assert.equal(custom?.migrateIn04B, false);
    assert.equal(tcr?.class, 'B_TEMPORARY');
    assert.equal(audit?.class, 'LEGACY_TELEMETRY');
  });
});

describe('Task 04A preferPostgresMasterData (stale localStorage loses)', () => {
  it('uses PostgreSQL payload when ok, even if empty and localStorage is stale/full', () => {
    const staleLocal = [{ id: 'stale', cableCode: 'OLD-1' }];
    const resolved = preferPostgresMasterData({ ok: true, data: [] as typeof staleLocal }, staleLocal);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.staleLocalIgnored, true);
    assert.equal(resolved.authoritative, true);
    assert.deepEqual(resolved.data, []);
  });

  it('uses PostgreSQL current record over differing localStorage', () => {
    const pg = [{ id: 'pg', cableCode: 'NEW-99', description: 'from postgres' }];
    const ls = [{ id: 'ls', cableCode: 'NEW-99', description: 'stale local' }];
    const resolved = preferPostgresMasterData({ ok: true, data: pg }, ls);
    assert.equal(resolved.data[0].description, 'from postgres');
    assert.equal(resolved.staleLocalIgnored, true);
    assert.equal(resolved.authoritative, true);
  });

  it('falls back to localStorage only when PostgreSQL read failed — non-authoritative', () => {
    const ls = [{ id: 'ls', cableCode: 'OFFLINE' }];
    const resolved = preferPostgresMasterData({ ok: false, error: '503' }, ls);
    assert.equal(resolved.source, 'LOCALSTORAGE_FALLBACK');
    assert.equal(resolved.staleLocalIgnored, false);
    assert.equal(resolved.authoritative, false);
    assert.equal(resolved.data[0].cableCode, 'OFFLINE');
  });
});

describe('Task 04B-1 Master Data SoT cutover framework', () => {
  it('defines formal gates A–J without a second SoT registry', () => {
    assert.deepEqual(Object.keys(MASTER_DATA_CUTOVER_GATE_DEFINITIONS).sort(), [
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'I',
      'J',
    ]);
    assert.equal(MASTER_DATA_CUTOVER_FRAMEWORK.task, '04B-1');
    assert.equal(MASTER_DATA_CUTOVER_FRAMEWORK.frozen04A, '57caf852067fea4b29efdfd4d73733499a0ba4f0');
    assert.equal(MASTER_DATA_CUTOVER_FRAMEWORK.frozen04B1, 'fb03a3c8ccc2d339f021aac1950ec06959305d2e');
    assert.equal(MASTER_DATA_CUTOVER_FRAMEWORK.entityCutoversExecuted, true);
    assert.deepEqual([...MASTER_DATA_CUTOVER_FRAMEWORK.entityCutoversCompleted], [
      'RawMaterial',
      'ImportBatch',
      'CableMaster',
      'DrumMaster',
    ]);
  });

  it('keeps cutover matrix aligned to registry authority (no invented SoT)', () => {
    assert.ok(MASTER_DATA_CUTOVER_MATRIX.length >= 16);
    for (const row of MASTER_DATA_CUTOVER_MATRIX) {
      const sot = sotStatusForEntity(row.registryEntity);
      assert.ok(sot, row.registryEntity);
      assert.equal(row.currentSoTStatus, sot.status, row.entity);
      assert.equal(row.cutoverPhase, sot.cutoverPhase, row.entity);
      if (row.currentSoTStatus !== 'POSTGRESQL_SOT' && !isAuthoritativeServerAudit(row.registryEntity)) {
        assert.equal(row.cutoverReady, false, `${row.entity} must not claim cutover ready`);
      }
    }
    assert.equal(cutoverMatrixForEntity('Cable Master')?.cutoverReady, true);
    assert.equal(cutoverMatrixForEntity('Cable Master')?.currentSoTStatus, 'POSTGRESQL_SOT');
    assert.equal(cutoverMatrixForEntity('Drum Master')?.cutoverReady, true);
    assert.equal(cutoverMatrixForEntity('Drum Master')?.currentSoTStatus, 'POSTGRESQL_SOT');
    assert.equal(cutoverMatrixForEntity('DrumCompatibility')?.currentSoTStatus, 'BLOCKED');
    assert.ok(entitiesNotCutoverReady().some((r) => r.registryEntity === 'CableBomLine'));
  });

  it('CableMaster promoted to POSTGRESQL_SOT after 04B-7 gates A–J', () => {
    const cable = sotStatusForEntity('CableMaster');
    assert.ok(cable);
    assert.equal(cable.status, 'POSTGRESQL_SOT');
    assert.equal(canPromoteToPostgresqlSot(cable), true);
    assert.equal(allCutoverGatesPassed(cable.gates), true);
    assert.equal(cable.gates?.C, true);
    assert.equal(cable.gates?.B, true);
    assert.equal(cable.gates?.D, true);
    assert.equal(cable.cutoverPhase, 'POSTGRESQL_SOT');

    const customer = sotStatusForEntity('Customer');
    assert.ok(customer);
    assert.equal(canPromoteToPostgresqlSot(customer), true);
    assert.equal(allCutoverGatesPassed(customer.gates), true);

    const rm = sotStatusForEntity('RawMaterial');
    assert.ok(rm);
    assert.equal(rm.status, 'POSTGRESQL_SOT');
    assert.equal(canPromoteToPostgresqlSot(rm), true);
  });

  it('documents stop conditions and recommended order without executing', () => {
    assert.ok(MASTER_DATA_CUTOVER_STOP_CONDITIONS.some((s) => s.entity === 'DrumCompatibility'));
    assert.ok(MASTER_DATA_CUTOVER_STOP_CONDITIONS.some((s) => s.entity === 'CableMaster'));
    assert.equal(MASTER_DATA_CUTOVER_ORDER[0].entity, 'Customer');
    assert.ok(MASTER_DATA_CUTOVER_ORDER.some((o) => o.band === 'ALREADY_SOT' && o.entity === 'CableMaster'));
    assert.ok(MASTER_DATA_CUTOVER_ORDER.some((o) => o.entity === 'TechnicalOfficeRequest' && o.band === 'SEPARATE'));
  });

  it('does not mark complex entities as POSTGRESQL_SOT via framework alone', () => {
    for (const entity of [
      'CableBomLine',
      'AuditEvent',
      'CableParameter',
      'TechnicalOfficeRequest',
      'DrumCompatibility',
    ]) {
      assert.notEqual(sotStatusForEntity(entity)?.status, 'POSTGRESQL_SOT', entity);
      assert.equal(sotStatusForEntity(entity)?.postgresSoT, false, entity);
    }
    assert.equal(sotStatusForEntity('DrumMaster')?.status, 'POSTGRESQL_SOT');
  });
});
