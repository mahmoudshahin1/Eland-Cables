import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUDIT_LOCAL_IS_AUTHORITATIVE,
  AUDIT_LS_CLASS,
  AUDIT_STORAGE_KEY,
} from './audit/auditLogService';
import {
  MASTER_DATA_CUTOVER_FRAMEWORK,
  MASTER_DATA_CUTOVER_MATRIX,
  allCutoverGatesPassed,
  canPromoteToPostgresqlSot,
  cutoverMatrixForEntity,
  isAuthoritativeServerAudit,
  sotStatusForEntity,
} from './masterDataSoT';
import { preferPostgresAudit } from '../server/serverAudit';

describe('Task 04B-4 Audit authority & legacy telemetry', () => {
  it('Test 1: AuditEvent uses AUTHORITATIVE_SERVER_AUDIT — not POSTGRESQL_SOT', () => {
    const audit = sotStatusForEntity('AuditEvent');
    assert.ok(audit);
    assert.equal(audit.status, 'POSTGRESQL_PRIMARY');
    assert.equal(audit.postgresSoT, false);
    assert.equal(audit.auditAuthority, 'AUTHORITATIVE_SERVER_AUDIT');
    assert.equal(audit.cutoverPhase, 'AUTHORITATIVE_SERVER_AUDIT');
    assert.equal(audit.localStorageAuthority, false);
    assert.equal(audit.keyClass, 'LEGACY_TELEMETRY');
    assert.equal(allCutoverGatesPassed(audit.gates), true);
    assert.equal(canPromoteToPostgresqlSot(audit), false);
    assert.equal(isAuthoritativeServerAudit('AuditEvent'), true);
  });

  it('Test 2: matrix marks audit authority established without POSTGRESQL_SOT promotion', () => {
    const row = cutoverMatrixForEntity('Audit');
    assert.ok(row);
    assert.equal(row.currentSoTStatus, 'POSTGRESQL_PRIMARY');
    assert.equal(row.cutoverReady, true);
    assert.equal(row.blockingReason, null);
    assert.equal(row.lsAuthoritative, false);
    assert.equal(row.v1V2Converged, true);
    assert.ok(MASTER_DATA_CUTOVER_FRAMEWORK.auditAuthorityEstablished.includes('AuditEvent'));
    assert.equal(MASTER_DATA_CUTOVER_FRAMEWORK.nextEntityCutover, 'CableBomLine');
  });

  it('Test 3: does not promote sibling PRIMARY entities via audit authority task', () => {
    assert.equal(sotStatusForEntity('CableMaster')?.status, 'POSTGRESQL_SOT');
    assert.equal(sotStatusForEntity('DrumMaster')?.status, 'POSTGRESQL_SOT');
    for (const entity of ['CableBomLine', 'CableParameter']) {
      assert.equal(sotStatusForEntity(entity)?.status, 'POSTGRESQL_PRIMARY', entity);
      assert.equal(isAuthoritativeServerAudit(entity), false, entity);
      assert.equal(cutoverMatrixForEntity(entity)?.cutoverReady, false, entity);
    }
  });

  it('Test 4: PG audit events + LS stale telemetry → PG wins', () => {
    const pg = [{ id: 'pg-1', entity: 'DrumMaster', action: 'CREATE' }];
    const ls = [{ id: 'ls-9', entity: 'DrumMaster', action: 'CREATE' }];
    const resolved = preferPostgresAudit({ ok: true, data: pg }, ls);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.equal(resolved.staleLegacyIgnored, true);
    assert.equal(resolved.data[0].id, 'pg-1');
  });

  it('Test 5: PG empty + LS has events → empty PG wins (no resurrect)', () => {
    const ls = [{ id: 'legacy-1', entity: 'Quotation', action: 'CREATE' }];
    const resolved = preferPostgresAudit({ ok: true, data: [] }, ls);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.deepEqual(resolved.data, []);
  });

  it('Test 6: PG unavailable + LS → fallback non-authoritative', () => {
    const ls = [{ id: 'offline-1', entity: 'Customer', action: 'UPDATE' }];
    const resolved = preferPostgresAudit({ ok: false, error: '503' }, ls);
    assert.equal(resolved.source, 'LEGACY_TELEMETRY_FALLBACK');
    assert.equal(resolved.authoritative, false);
    assert.equal(resolved.data[0].id, 'offline-1');
  });

  it('Test 7: legacy telemetry constants — LS never authoritative', () => {
    assert.equal(AUDIT_STORAGE_KEY, 'energya_platform_audit_v1');
    assert.equal(AUDIT_LS_CLASS, 'LEGACY_TELEMETRY');
    assert.equal(AUDIT_LOCAL_IS_AUTHORITATIVE, false);
  });

  it('Test 8: registry matrix row documents immutability posture (no POSTGRESQL_SOT claim)', () => {
    const matrix = MASTER_DATA_CUTOVER_MATRIX.find((r) => r.registryEntity === 'AuditEvent');
    assert.ok(matrix);
    assert.equal(matrix.targetStatus, 'POSTGRESQL_PRIMARY');
    assert.equal(matrix.pgWriteComplete, true);
    assert.equal(matrix.auditVerified, true);
    assert.match(matrix.gate04B, /AUTHORITATIVE_SERVER_AUDIT/);
  });

  it('Test 9: V1/V2 admin surfaces share server audit APIs (evidence flags)', () => {
    const row = cutoverMatrixForEntity('AuditEvent');
    assert.ok(row);
    assert.equal(row.v1ReadPath, true);
    assert.equal(row.v2ReadPath, true);
    assert.equal(row.v1V2Converged, true);
  });

  it('Test 10: failed PG read must not claim authoritative audit from legacy telemetry', () => {
    const stale = [
      { id: 'a1', action: 'IMPORT' },
      { id: 'a2', action: 'UPDATE' },
    ];
    const resolved = preferPostgresAudit({ ok: false, error: 'ECONNREFUSED' }, stale);
    assert.equal(resolved.authoritative, false);
    assert.equal(resolved.staleLegacyIgnored, false);
    assert.equal(resolved.data.length, 2);
  });
});
